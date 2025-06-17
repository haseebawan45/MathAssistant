# 🧮 MathBot - Math Problem Solver

A beautiful, responsive math-focused chatbot powered by Google Gemini 2.0 Flash. This application helps solve mathematical problems with clean LaTeX rendering.

![MathBot Demo](https://i.imgur.com/placeholder.gif)

## Features

- 🔢 Solves a wide variety of math problems
- ✨ Beautiful, responsive UI with animations
- 📐 LaTeX rendering for mathematical expressions
- 💬 Chat-like interface for easy interaction
- 📱 Mobile-friendly design
- 🔄 Smart rate limit handling with exponential backoff

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, etc.)
- A Google Gemini API key (already included in the code, for demo purposes only)

### Installation

1. Download all files to a local folder:
   - `index.html`
   - `style.css`
   - `script.js`

2. Open `index.html` in your web browser

3. Start asking math questions!

## Usage Examples

Try asking questions like:

- "Solve x^2 + 5x + 6 = 0"
- "Differentiate f(x) = sin(x^2)"
- "What is the integral of ln(x)?"
- "Find the eigenvalues of [[2,1],[1,2]]"
- "Prove that the sum of two odd numbers is even"

## Rate Limiting Solution

This application uses Gemini 2.0 Flash, which has better rate limits on the free tier (15 requests per minute, 1,500 requests per day). It also implements exponential backoff to handle any rate limiting gracefully:

1. When a rate limit error (HTTP 429) is encountered, the app will:
   - Show a message indicating it's retrying
   - Wait for an increasing amount of time between retries
   - Automatically retry the request up to 5 times

This ensures a better user experience even when hitting API limits.

## ⚠️ Security Note

This demo includes an API key in the JavaScript file. **This is not secure for production use!** 

For a production environment:
- Move the API key to a server-side application
- Create a proxy API to handle Gemini API calls
- Consider using environment variables or a secure vault

## Customization

You can customize the look and feel by:
- Modifying colors in the CSS `:root` variables
- Changing the system prompt in the `chatHistory` initialization
- Adding additional features like voice input or local storage for chat history

## License

This project is for educational purposes only.

## Acknowledgements

- [Google Gemini AI](https://ai.google.dev/) for providing the LLM API
- [KaTeX](https://katex.org/) for math rendering
- [Marked](https://marked.js.org/) for Markdown parsing