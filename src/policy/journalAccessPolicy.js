const participantKey = (leftId, rightId) => [leftId.toString(), rightId.toString()].sort().join("|")

const isAuthor = (journal, userId) => journal.authorId.equals(userId)

const isJournalHiddenFromViewer = (journal, userId, relationships) => {
    if (isAuthor(journal, userId)) return false

    const key = participantKey(userId, journal.authorId)
    return relationships.blocked.has(key) ||
        journal.visibility === "private" ||
        (journal.visibility === "friends" && !relationships.friends.has(key))
}

const resolveAccessMode = (journal, { isFriend, isFollower, isSubscriber }) => {
    switch (journal.visibility) {
        case "public": return "full"
        case "friends": return isFriend ? "full" : "hidden"
        case "selected": return isFollower ? "full" : "preview"
        case "subscribed": return isSubscriber ? "full" : "teaser"
        default: return "hidden"
    }
}

const canReadEntryWithAccess = (entry, access) => {
    if (access.isAuthor) return true

    switch (entry.visibility) {
        case "public": return true
        case "friends": return access.isFriend
        case "selected": return access.isFollower
        case "subscribed": return access.isSubscriber
        default: return false
    }
}

const readableEntryVisibilities = access => {
    if (access.isAuthor) return null

    const visibilities = ["public"]
    if (access.isFriend) visibilities.push("friends")
    if (access.isFollower) visibilities.push("selected")
    if (access.isSubscriber) visibilities.push("subscribed")
    return visibilities
}

const canReadJournal = (journal, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (isAuthor(journal, userId)) return true
    if (isJournalHiddenFromViewer(journal, userId, relationships)) return false

    switch (journal.visibility) {
        case "public":
        case "friends": return true
        case "selected": return followedIds.has(journal._id.toString())
        case "subscribed": return subscribedAuthorIds.has(journal.authorId.toString())
        default: return false
    }
}

const canReadEntry = (entry, journal, userId, relationships, followedIds, subscribedAuthorIds) => {
    if (!canReadJournal(journal, userId, relationships, followedIds, subscribedAuthorIds)) return false
    return canReadEntryWithAccess(entry, {
        isAuthor: isAuthor(journal, userId),
        isFriend: relationships.friends.has(participantKey(userId, journal.authorId)),
        isFollower: followedIds.has(journal._id.toString()),
        isSubscriber: subscribedAuthorIds.has(journal.authorId.toString())
    })
}

const journalDiscoveryError = (journal, userId, relationships) => {
    if (isAuthor(journal, userId)) {
        return { statusCode: 403, message: "You cannot follow your own journal" }
    }
    return isJournalHiddenFromViewer(journal, userId, relationships) ? { statusCode: 404, message: "Journal does not exist" } : null
}

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
    return null
}

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
    return null
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

