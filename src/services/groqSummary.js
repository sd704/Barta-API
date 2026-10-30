const Groq = require("groq-sdk")
const { SUMMARY_QUERY, SUMMARY_TEXT_MAX, REQUEST_TIMEOUT_MS } = require("../utils/constant")
const SUMMARY_API_KEY = process.env.SUMMARY_API_KEY

const groqSummary = async (payload) => {
    if (!SUMMARY_API_KEY) throw new Error('Summary API key not configured')

    const groq = new Groq({ apiKey: SUMMARY_API_KEY });

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: SUMMARY_QUERY + '\n' + JSON.stringify(payload),
            }],
            model: "openai/gpt-oss-120b",
        }, {
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: 0
        });

        const response = chatCompletion.choices[0]?.message
        // response.reasoning shows the AI reasoning

        const text = response?.content || ""
        if (!text.trim()) throw new Error("Summary API returned an invalid summary")
        return text.trim().slice(0, SUMMARY_TEXT_MAX)
    } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            throw new Error(`Summary request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`)
        }
        throw error
    }
}

module.exports = { groqSummary }