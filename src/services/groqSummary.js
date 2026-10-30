const Groq = require("groq-sdk")
const { SUMMARY_QUERY, SUMMARY_TEXT_MAX } = require("../utils/constant")
const SUMMARY_API_KEY = process.env.SUMMARY_API_KEY
const groq = new Groq({ apiKey: SUMMARY_API_KEY });

const groqSummary = async (payload) => {
    if (!SUMMARY_API_KEY) throw new Error('Summary API key not configured')

    const chatCompletion = await groq.chat.completions.create({
        messages: [{
            role: "user",
            content: SUMMARY_QUERY + '\n' + JSON.stringify(payload),
        }],
        model: "openai/gpt-oss-120b",
    });

    const text = chatCompletion.choices[0]?.message?.content || ""
    if (!text.trim()) throw new Error("Summary API returned an invalid summary")
    return text.trim().slice(0, SUMMARY_TEXT_MAX)
}

module.exports = { groqSummary }