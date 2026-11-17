const { normalizeId } = require("../utils/objectId")
const { CHAPTER_TITLE_MAX, MAX_CHAPTERS } = require("../utils/constant")
const { isPlainObject, rejectExtraFields, cleanString } = require("../validation/common")

// For PATCH Journal "chapters": the full chapter list in the new order.
// An item with cid is an existing chapter, an item without cid is a new chapter.
// Throws an Error on a bad item, so the caller's try/catch sends the 400.
const normalizeChapterList = (chapters) => {
    if (!Array.isArray(chapters) || !chapters.length) throw new Error("chapters must be a non-empty array")
    if (chapters.length > MAX_CHAPTERS) throw new Error(`chapters cannot contain more than ${MAX_CHAPTERS} items`)

    const ids = new Set() // To detect duplicate chapters
    return chapters.map((chapter, index) => {
        if (!isPlainObject(chapter)) throw new Error(`chapters[${index}] must be an object`)

        const extraFields = rejectExtraFields(chapter, ["cid", "title"])
        if (extraFields) throw new Error(extraFields)

        const title = cleanString(chapter.title, `chapters[${index}].title`, { required: true, max: CHAPTER_TITLE_MAX })
        if (chapter.cid === undefined) return { title } // New chapter

        const cid = normalizeId(chapter.cid) // Lowercase, the same form as _id.toString()
        if (!cid) throw new Error(`Invalid chapter ID at chapters[${index}]`)

        if (ids.has(cid)) throw new Error("Duplicate chapter ID")
        ids.add(cid)
        return { cid, title }
    })
}

module.exports = { normalizeChapterList }