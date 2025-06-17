// Configuration
const API_KEY = "AIzaSyDT28ot1ZVsC0zkBkhDKZoTq3HnWbkjWV8";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

// DOM Elements
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-btn");

// Add event listener for Enter key
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendQuestion();
  }
});

// Initialize chat history
let chatHistory = [
  { role: "system", content: "You are a math expert assistant. Only respond to math-related questions. For non-math questions, politely redirect the conversation to mathematics. Always format your answers using LaTeX for equations when appropriate. Be concise but thorough in your explanations." }
];

// Function to send questions to the API
async function sendQuestion() {
  const question = userInput.value.trim();
  if (!question) return;

  // Clear input field
  userInput.value = "";
  
  // Add user message to chat
  addMessageToChat("user", question);
  
  // Show loading indicator
  showLoading();
  
  // Add to chat history for UI (Gemini doesn't use the same format)
  chatHistory.push({ role: "user", content: question });
  
  try {
    // Format messages for Gemini API
    const messages = formatMessagesForGemini();
    
    // Call the API
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: messages,
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      })
    });
    
    // Parse response
    const data = await response.json();
    
    // Check for errors
    if (data.error) {
      throw new Error(data.error.message || "API Error");
    }
    
    // Get bot reply
    const reply = data.candidates[0].content.parts[0].text;
    
    // Remove loading indicator
    removeLoading();
    
    // Add bot message to chat
    addMessageToChat("bot", reply);
    
    // Add to chat history
    chatHistory.push({ role: "assistant", content: reply });
    
    // Render any math expressions
    renderMathExpressions();
    
  } catch (error) {
    console.error("API Error:", error);
    
    // Remove loading indicator
    removeLoading();
    
    // Show error message
    addMessageToChat("bot", "Sorry, I encountered an error. Please try again.");
  }
}

// Format messages for Gemini API
function formatMessagesForGemini() {
  const formattedMessages = [];
  
  // Add system message as a user message with [SYSTEM] prefix
  formattedMessages.push({
    role: "user",
    parts: [{ text: "[SYSTEM] " + chatHistory[0].content }]
  });
  
  // Add the rest of the messages
  for (let i = 1; i < chatHistory.length; i++) {
    const message = chatHistory[i];
    formattedMessages.push({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.content }]
    });
  }
  
  return formattedMessages;
}

// Function to add a message to the chat UI
function addMessageToChat(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = role === "user" ? "user-message" : "bot-message";
  
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "👤" : "🧮";
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  
  // Process markdown and code blocks in the content
  const processedContent = processContent(content);
  messageContent.innerHTML = processedContent;
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);
  
  chatBox.appendChild(messageDiv);
  
  // Scroll to bottom
  scrollToBottom();
}

// Function to process content with markdown
function processContent(content) {
  // Replace code blocks for math expressions
  content = content.replace(/```math\n([\s\S]*?)\n```/g, '<div class="math-expression">$1</div>');
  content = content.replace(/```latex\n([\s\S]*?)\n```/g, '<div class="math-expression">$1</div>');
  
  // Replace inline math expressions
  content = content.replace(/\$\$([\s\S]*?)\$\$/g, '<span class="math-inline">$1</span>');
  content = content.replace(/\$([\s\S]*?)\$/g, '<span class="math-inline">$1</span>');
  
  // Use marked for general markdown
  return marked.parse(content);
}

// Function to render math expressions using KaTeX
function renderMathExpressions() {
  // Render block math expressions
  document.querySelectorAll('.math-expression').forEach(element => {
    try {
      katex.render(element.textContent, element, {
        displayMode: true,
        throwOnError: false
      });
    } catch (e) {
      console.error("KaTeX error:", e);
    }
  });
  
  // Render inline math expressions
  document.querySelectorAll('.math-inline').forEach(element => {
    try {
      katex.render(element.textContent, element, {
        displayMode: false,
        throwOnError: false
      });
    } catch (e) {
      console.error("KaTeX error:", e);
    }
  });
}

// Show loading indicator
function showLoading() {
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "bot-message loading";
  
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "🧮";
  
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "loading-indicator";
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    loadingIndicator.appendChild(dot);
  }
  
  loadingDiv.appendChild(avatar);
  loadingDiv.appendChild(loadingIndicator);
  
  chatBox.appendChild(loadingDiv);
  scrollToBottom();
}

// Remove loading indicator
function removeLoading() {
  const loadingElement = document.querySelector(".loading");
  if (loadingElement) {
    loadingElement.remove();
  }
}

// Scroll to bottom of chat
function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}

// First-time focus on input field
window.onload = () => {
  userInput.focus();
}; 