// For access related decisions
// journalAccess, journalReaderContext and controllers use these after already loading data

// Pair key for Connection.participants and Blocklist.participants
const participantKey = (leftId, rightId) => [leftId.toString(), rightId.toString()].sort().join("|")

// Author check
const isAuthor = (journal, userId) => journal.authorId.equals(userId)

// "Hidden" true for Journal for: blocked users, private journal or friends journal for non-friend
// Selected and subscribed journals are visible in a limited form, so they are not hidden here.
const isJournalHiddenFromViewer = (journal, userId, relationships) => {
    if (isAuthor(journal, userId)) return false

    const key = participantKey(userId, journal.authorId)
    return relationships.blocked.has(key) ||
        journal.visibility === "private" ||
        (journal.visibility === "friends" && !relationships.friends.has(key))
}

// Decide the journal visibility based on user for GET Journal route
// Used by resolveJournalAccess
const resolveAccessMode = (journal, { isFriend, isFollower, isSubscriber }) => {
    switch (journal.visibility) {
        case "public": return "full" // Authenticated readers see entries, progress, and the summary.
        case "friends": return isFriend ? "full" : "hidden" // A non-friend gets the same 404 as a missing journal.
        case "selected": return isFollower ? "full" : "preview" // Not yet approved: journal detail, every entry marked hidden.
        case "subscribed": return isSubscriber ? "full" : "teaser" // Not yet paid: journal detail plus the first three non-private titles.
        default: return "hidden" // Private journals, and anything unexpected, are concealed.
    }
}

// Decide how much Entry data we want to show particular user
// Used by getJournal, requireEntryReadAccess
const canReadEntryWithAccess = (entry, access) => {
    if (access.isAuthor) return true

    switch (entry.visibility) {
        case "public": return true
        case "friends": return access.isFriend
        case "selected": return access.isFollower // An approved follower of this journal.
        case "subscribed": return access.isSubscriber // A paying reader of this author.
        default: return false // Private.
    }
}

// Mongo filter for GET "/entries", Used by entryController
const readableEntryVisibilities = access => {
    if (access.isAuthor) return null

    const visibilities = ["public"] // Public entries are readable by anyone who can see the journal's entries.
    if (access.isFriend) visibilities.push("friends")
    if (access.isFollower) visibilities.push("selected")
    if (access.isSubscriber) visibilities.push("subscribed")
    return visibilities
}

// "Library -> journals user follows" uses this to drop journals the reader can no longer discover.
// Preview and teaser journals stay out of that list: selected requires an active follow, subscribed requires payment.
const canReadJournal = (journal, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (isAuthor(journal, userId)) return true
    if (isJournalHiddenFromViewer(journal, userId, relationships)) return false

    switch (journal.visibility) {
        case "public":
        case "friends": return true // Friends already passed isJournalHiddenFromViewer, so a remaining friends journal is readable.
        case "selected": return followedIds.has(journal._id.toString())
        case "subscribed": return subscribedAuthorIds.has(journal.authorId.toString())
        default: return false
    }
}

// Required for Saved Entries
const canReadEntry = (entry, journal, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (!canReadJournal(journal, userId, relationships, followedIds, subscribedAuthorIds)) return false
    return canReadEntryWithAccess(entry, {
        isAuthor: isAuthor(journal, userId),
        isFriend: relationships.friends.has(participantKey(userId, journal.authorId)),
        isFollower: followedIds.has(journal._id.toString()),
        isSubscriber: subscribedAuthorIds.has(journal.authorId.toString())
    })
}

// followController calls this before creating a follow. Null means the request may continue to the payment and status rules.
const journalDiscoveryError = (journal, userId, relationships) => {
    if (isAuthor(journal, userId)) return { statusCode: 403, message: "You cannot follow your own journal" }

    return isJournalHiddenFromViewer(journal, userId, relationships) ? { statusCode: 404, message: "Journal does not exist" } : null
}

// interactionController and commentController recheck an entry inside the transaction, in case access changed after middleware ran.
const entryInteractionError = (journal, entry, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (isJournalHiddenFromViewer(journal, userId, relationships)) {
        return { statusCode: 404, message: "Journal does not exist" }
    }
    if (journal.visibility === "selected" && !followedIds.has(journal._id.toString())) {
        return { statusCode: 403, message: "Entries are hidden until the author approves your follow request" }
    }
    if (journal.visibility === "subscribed" && !subscribedAuthorIds.has(journal.authorId.toString())) {
        return { statusCode: 403, message: "Subscribe to this author to read entries in this journal" }
    }
    if (!canReadEntry(entry, journal, userId, relationships, followedIds, subscribedAuthorIds)) {
        return { statusCode: 404, message: "Entry does not exist" }
    }
    return null // Access allowed
}

// Checks whether a user has enough access to read or write journal-level comments.
// Because there is no entry, the API cannot use entryInteractionError. Instead, fullJournalAccessError checks only journal access.
const fullJournalAccessError = (journal, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (isAuthor(journal, userId)) return null
    if (isJournalHiddenFromViewer(journal, userId, relationships)) {
        return { statusCode: 404, message: "Journal does not exist" }
    }
    if (journal.visibility === "selected" && !followedIds.has(journal._id.toString())) {
        return { statusCode: 403, message: "Comments are available after the author approves your follow request" }
    }
    if (journal.visibility === "subscribed" && !subscribedAuthorIds.has(journal.authorId.toString())) {
        return { statusCode: 403, message: "Subscribe to this author to read and comment on this journal" }
    }
    return null // Access allowed
}

module.exports = {
    participantKey,
    isJournalHiddenFromViewer,
    resolveAccessMode,
    canReadEntryWithAccess,
    readableEntryVisibilities,
    canReadJournal,
    canReadEntry,
    journalDiscoveryError,
    entryInteractionError,
    fullJournalAccessError
}

