const SAFE_DATA = ["_id", "firstName", "lastName", "email", "about", "description", "age", "gender", "pfp"]
const ALLOWED_UPDATES = ["firstName", "lastName", "about", "description", "age", "gender", "pfp"]
const CONNECTION_SAFE_DATA = ["senderId", "receiverId", "status", "createdAt"]

const PUBLIC_PROFILE_FIELDS = "firstName lastName fullName pfp about"
const AUTHOR_CARD_FIELDS = "firstName lastName fullName pfp"
const USER_NAME_FIELDS = "firstName lastName fullName"

const VISIBILITIES = ["public", "private", "friends", "selected", "subscribed"]
const JOURNAL_STATUSES = ["active", "paused", "completed", "archived"]
const JOURNAL_SORTS = ["updated", "alpha", "created", "manual"]
const ENTRY_TYPES = ["journal", "decision", "milestone", "failure", "lesson", "launch"]
const FOLLOW_STATUSES = ["pending", "active"]
const FOLLOW_DECISIONS = ["active", "rejected"]
const SUMMARY_JOB_STATUSES = ["pending", "processing", "failed"]


// If Journal visibility is key, Entry visibility can be any one of the values
const ENTRY_VISIBILITY_BY_JOURNAL = {
    private: ["private"],
    friends: ["friends", "private"],
    subscribed: ["subscribed", "private"],
    selected: ["selected", "private"],
    public: ["public", "private", "friends", "selected"]
}

const JOURNAL_TITLE_MAX = 140
const JOURNAL_ABOUT_MAX = 500
const JOURNAL_CATEGORY_MAX = 30
const CHAPTER_TITLE_MAX = 120
const MAX_CHAPTERS = 100
const PROGRESS_MIN = 0
const PROGRESS_MAX = 100

const ENTRY_TITLE_MAX = 180
const ENTRY_PREVIEW_MAX = 280
const ENTRY_BODY_MAX = 100000
const ENTRY_MOOD_MAX = 40
const TAG_MAX_LENGTH = 30
const MAX_TAGS = 5
const WORDS_PER_MINUTE = 200

const COMMENT_TEXT_MAX = 2000

const COVER_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+={0,2}$/
const MAX_COVER_LENGTH = 700000

const SUBSCRIPTION_PRICE = { amount: 0, currency: "rupee" }

const DEFAULT_PAGE_LIMIT = 12
const DEFAULT_LIST_LIMIT = 20
const MAX_PAGE_LIMIT = 50

const MAX_ATTEMPTS = 3
const LOCK_TIMEOUT_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15 * 1000
const SUMMARY_TEXT_MAX = 20000
const ENTRY_FIELDS = "chapterId type title preview body mood tags createdAt updatedAt"

const SUMMARY_QUERY = `The following JSON data is from a Journal, which has Chapters, and Chapters has Entries. 
Summarize this data into a paragraph or two, which is easy to read, should be within 1000 characters. 
The output should be strictly a string, without quotes.`

module.exports = {
    SAFE_DATA,
    ALLOWED_UPDATES,
    CONNECTION_SAFE_DATA,
    PUBLIC_PROFILE_FIELDS,
    AUTHOR_CARD_FIELDS,
    USER_NAME_FIELDS,
    VISIBILITIES,
    JOURNAL_STATUSES,
    JOURNAL_SORTS,
    ENTRY_TYPES,
    FOLLOW_STATUSES,
    FOLLOW_DECISIONS,
    SUMMARY_JOB_STATUSES,
    ENTRY_VISIBILITY_BY_JOURNAL,
    JOURNAL_TITLE_MAX,
    JOURNAL_ABOUT_MAX,
    JOURNAL_CATEGORY_MAX,
    CHAPTER_TITLE_MAX,
    MAX_CHAPTERS,
    PROGRESS_MIN,
    PROGRESS_MAX,
    ENTRY_TITLE_MAX,
    ENTRY_PREVIEW_MAX,
    ENTRY_BODY_MAX,
    ENTRY_MOOD_MAX,
    TAG_MAX_LENGTH,
    MAX_TAGS,
    WORDS_PER_MINUTE,
    COMMENT_TEXT_MAX,
    COVER_PATTERN,
    MAX_COVER_LENGTH,
    SUBSCRIPTION_PRICE,
    DEFAULT_PAGE_LIMIT,
    DEFAULT_LIST_LIMIT,
    MAX_PAGE_LIMIT,
    MAX_ATTEMPTS,
    LOCK_TIMEOUT_MS,
    REQUEST_TIMEOUT_MS,
    SUMMARY_TEXT_MAX,
    ENTRY_FIELDS,
    SUMMARY_QUERY
}

