// Configuration
const API_KEY = "AIzaSyDT28ot1ZVsC0zkBkhDKZoTq3HnWbkjWV8";
const API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

// DOM Elements
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const welcomeScreen = document.getElementById("welcome-screen");
const chatHistoryContainer = document.getElementById("chat-history");
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");

// Mobile menu toggle
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 900 && 
        sidebar.classList.contains("open") && 
        !sidebar.contains(e.target) && 
        e.target !== menuToggle) {
      sidebar.classList.remove("open");
    }
  });
}

// Add event listener for Enter key
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // Prevent default to avoid new line
    sendQuestion();
  }
});

// Add click event for send button
sendBtn.addEventListener("click", sendQuestion);

// Auto-resize textarea
userInput.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = (this.scrollHeight) + "px";
  // Limit max height
  if (this.scrollHeight > 200) {
    this.style.overflowY = "auto";
  } else {
    this.style.overflowY = "hidden";
  }
});

// Initialize chat history
let chatHistory = [
  { role: "system", content: "You are a math expert assistant. Only respond to math-related questions. For non-math questions, politely redirect the conversation to mathematics. Always format your answers using LaTeX for equations when appropriate. Be concise but thorough in your explanations." }
];

// Current chat ID
let currentChatId = null;

// Backoff parameters
let retryCount = 0;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000; // 1 second

// Initialize Firestore references
let chatsCollection;

// Wait for Firebase to initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Focus input field
  userInput.focus();
  
  // Add input container focus effect
  const inputContainer = document.querySelector('.input-container');
  userInput.addEventListener('focus', () => {
    inputContainer.classList.add('focused');
  });
  
  userInput.addEventListener('blur', () => {
    inputContainer.classList.remove('focused');
  });
  
  // Wait for Firebase to be available
  await waitForFirebase();
  
  // Initialize Firestore references
  chatsCollection = window.db.collection('chats');
  
  // Load chat history
  loadChatHistory();
  
  // Create a new chat if none exists
  if (!currentChatId) {
    createNewChat();
  }
});

// Wait for Firebase to initialize
function waitForFirebase() {
  return new Promise((resolve) => {
    const checkFirebase = () => {
      if (window.db) {
        resolve();
      } else {
        setTimeout(checkFirebase, 100);
      }
    };
    checkFirebase();
  });
}

// Load chat history from Firestore
async function loadChatHistory() {
  try {
    // Show loading animation
    chatHistoryContainer.innerHTML = `
      <div class="loading-history">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    
    // Get chats ordered by last updated timestamp
    const snapshot = await chatsCollection.orderBy('updatedAt', 'desc').get();
    
    // Clear loading indicator
    chatHistoryContainer.innerHTML = '';
    
    if (snapshot.empty) {
      // No chats found, create a new one
      createNewChat();
      return;
    }
    
    // Group chats by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);
    
    let todayChats = [];
    let yesterdayChats = [];
    let weekChats = [];
    let monthChats = [];
    let olderChats = [];
    
    snapshot.forEach(doc => {
      const chat = doc.data();
      const chatDate = chat.updatedAt.toDate();
      
      // Add chat to appropriate group
      if (chatDate >= today) {
        todayChats.push({ id: doc.id, ...chat });
      } else if (chatDate >= yesterday) {
        yesterdayChats.push({ id: doc.id, ...chat });
      } else if (chatDate >= lastWeek) {
        weekChats.push({ id: doc.id, ...chat });
      } else if (chatDate >= lastMonth) {
        monthChats.push({ id: doc.id, ...chat });
      } else {
        olderChats.push({ id: doc.id, ...chat });
      }
    });
    
    // Add chats to sidebar
    if (todayChats.length > 0) {
      addChatSection('Today', todayChats);
    }
    
    if (yesterdayChats.length > 0) {
      addChatSection('Yesterday', yesterdayChats);
    }
    
    if (weekChats.length > 0) {
      addChatSection('7 Days', weekChats);
    }
    
    if (monthChats.length > 0) {
      addChatSection('30 Days', monthChats);
    }
    
    if (olderChats.length > 0) {
      addChatSection('Older', olderChats);
    }
    
    // Set current chat to the most recent one
    if (todayChats.length > 0) {
      setCurrentChat(todayChats[0].id);
    } else if (yesterdayChats.length > 0) {
      setCurrentChat(yesterdayChats[0].id);
    } else if (weekChats.length > 0) {
      setCurrentChat(weekChats[0].id);
    } else if (monthChats.length > 0) {
      setCurrentChat(monthChats[0].id);
    } else if (olderChats.length > 0) {
      setCurrentChat(olderChats[0].id);
    }
    
  } catch (error) {
    console.error("Error loading chat history:", error);
    // Show error in chat history
    chatHistoryContainer.innerHTML = `
      <div class="history-error">
        Failed to load chat history.
        <button class="retry-btn">Retry</button>
      </div>
    `;
    
    // Add retry button event listener
    document.querySelector('.retry-btn').addEventListener('click', loadChatHistory);
  }
}

// Add a section of chats to the sidebar
function addChatSection(title, chats) {
  const section = document.createElement('div');
  section.className = 'history-section';
  
  const header = document.createElement('div');
  header.className = 'history-header';
  header.textContent = title;
  
  section.appendChild(header);
  
  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.id = chat.id;
    item.textContent = chat.title || 'New Chat';
    
    // Add click event
    item.addEventListener('click', () => {
      setCurrentChat(chat.id);
      
      // Close sidebar on mobile after selection
      if (window.innerWidth <= 900) {
        sidebar.classList.remove("open");
      }
    });
    
    section.appendChild(item);
  });
  
  chatHistoryContainer.appendChild(section);
}

// Set current chat
async function setCurrentChat(chatId) {
  try {
    // Set current chat ID
    currentChatId = chatId;
    
    // Highlight current chat in sidebar
    document.querySelectorAll('.history-item').forEach(item => {
      if (item.dataset.id === chatId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Show loading in chat box
    chatBox.innerHTML = '';
    chatBox.style.display = "flex";
    welcomeScreen.style.display = "none";
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-messages';
    loadingDiv.innerHTML = `
      <div class="loading-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    chatBox.appendChild(loadingDiv);
    
    // Get chat data
    const chatDoc = await chatsCollection.doc(chatId).get();
    
    if (!chatDoc.exists) {
      console.error("Chat not found");
      return;
    }
    
    const chat = chatDoc.data();
    
    // Reset chat history
    chatHistory = [
      { role: "system", content: "You are a math expert assistant. Only respond to math-related questions. For non-math questions, politely redirect the conversation to mathematics. Always format your answers using LaTeX for equations when appropriate. Be concise but thorough in your explanations." }
    ];
    
    // Clear chat box
    chatBox.innerHTML = '';
    
    // Load messages
    if (chat.messages && chat.messages.length > 0) {
      // Add messages to chat history
      chat.messages.forEach(message => {
        chatHistory.push(message);
        
        // Add message to UI
        if (message.role !== 'system') {
          addMessageToChat(message.role, message.content);
        }
      });
      
      // Render math expressions
      renderMathExpressions();
    } else {
      // No messages, show welcome screen
      welcomeScreen.style.display = "flex";
      chatBox.style.display = "none";
    }
    
  } catch (error) {
    console.error("Error setting current chat:", error);
    
    // Show error message
    chatBox.innerHTML = `
      <div class="chat-error">
        Failed to load chat messages.
        <button class="retry-btn" onclick="setCurrentChat('${chatId}')">Retry</button>
      </div>
    `;
  }
}

// Create a new chat
async function createNewChat() {
  try {
    // Create new chat document
    const chatRef = await chatsCollection.add({
      title: 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: []
    });
    
    // Set current chat ID
    currentChatId = chatRef.id;
    
    // Reset chat history
    chatHistory = [
      { role: "system", content: "You are a math expert assistant. Only respond to math-related questions. For non-math questions, politely redirect the conversation to mathematics. Always format your answers using LaTeX for equations when appropriate. Be concise but thorough in your explanations." }
    ];
    
    // Clear chat box
    chatBox.innerHTML = '';
    
    // Show welcome screen
    welcomeScreen.style.display = "flex";
    chatBox.style.display = "none";
    
    // Reload chat history in sidebar
    loadChatHistory();
    
    // Focus on input
    userInput.focus();
    
  } catch (error) {
    console.error("Error creating new chat:", error);
    
    // Show error notification
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = 'Failed to create new chat.';
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Function to send questions to the API
async function sendQuestion() {
  const question = userInput.value.trim();
  if (!question) return;

  // Hide welcome screen if visible
  if (welcomeScreen.style.display !== "none") {
    welcomeScreen.style.display = "none";
    chatBox.style.display = "flex";
  }

  // Clear input field
  userInput.value = "";
  userInput.style.height = "auto";
  
  // Add user message to chat
  addMessageToChat("user", question);
  
  // Show loading indicator
  showLoading();
  
  // Add to chat history for UI
  chatHistory.push({ role: "user", content: question });
  
  // Update chat title if this is the first message
  if (chatHistory.length === 2) { // system message + first user message
    updateChatTitle(question);
  }
  
  // Save message to Firestore
  await saveChatMessage({ role: "user", content: question });
  
  // Reset retry count for new question
  retryCount = 0;
  
  await sendRequestWithBackoff(question);
}

// Update chat title based on first message
async function updateChatTitle(message) {
  try {
    // Use first 30 characters of message as title
    const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
    
    // Update chat title in Firestore
    await chatsCollection.doc(currentChatId).update({
      title: title,
      updatedAt: new Date()
    });
    
    // Update title in sidebar
    const historyItem = document.querySelector(`.history-item[data-id="${currentChatId}"]`);
    if (historyItem) {
      historyItem.textContent = title;
    }
    
  } catch (error) {
    console.error("Error updating chat title:", error);
  }
}

// Save chat message to Firestore
async function saveChatMessage(message) {
  try {
    // Get current messages
    const chatDoc = await chatsCollection.doc(currentChatId).get();
    const chat = chatDoc.data();
    
    // Add message to messages array
    const messages = chat.messages || [];
    messages.push(message);
    
    // Update chat document
    await chatsCollection.doc(currentChatId).update({
      messages: messages,
      updatedAt: new Date()
    });
    
  } catch (error) {
    console.error("Error saving chat message:", error);
  }
}

// Function to send API request with exponential backoff
async function sendRequestWithBackoff(question) {
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
    
    // Check if we hit rate limits
    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }
    
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
    
    // Save message to Firestore
    await saveChatMessage({ role: "assistant", content: reply });
    
    // Render any math expressions
    renderMathExpressions();
    
  } catch (error) {
    console.error("API Error:", error);
    
    // Handle rate limit errors with exponential backoff
    if (error.message.includes("Rate limit") && retryCount < MAX_RETRIES) {
      retryCount++;
      const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
      console.log(`Rate limit hit. Retrying in ${backoffTime/1000} seconds... (Attempt ${retryCount} of ${MAX_RETRIES})`);
      
      // Update loading message
      updateLoadingMessage(`Rate limit hit. Retrying in ${backoffTime/1000} seconds... (Attempt ${retryCount} of ${MAX_RETRIES})`);
      
      // Wait and retry
      setTimeout(() => sendRequestWithBackoff(question), backoffTime);
      return;
    }
    
    // Remove loading indicator
    removeLoading();
    
    // Show error message
    addMessageToChat("bot", "Sorry, I encountered an error. Please try again in a moment.");
    
    // Save error message to Firestore
    await saveChatMessage({ role: "assistant", content: "Sorry, I encountered an error. Please try again in a moment." });
  }
}

// Update loading message
function updateLoadingMessage(message) {
  const loadingElement = document.querySelector(".loading .message-content");
  if (loadingElement) {
    loadingElement.textContent = message;
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
  
  if (role === "user") {
    avatar.innerHTML = '<i class="fas fa-user"></i>';
  } else {
    avatar.innerHTML = '<i class="fas fa-square-root-alt"></i>';
  }
  
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
  avatar.innerHTML = '<i class="fas fa-square-root-alt"></i>';
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = "Calculating...";
  
  const loadingIndicator = document.createElement("div");
  loadingIndicator.className = "loading-indicator";
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    loadingIndicator.appendChild(dot);
  }
  
  loadingDiv.appendChild(avatar);
  loadingDiv.appendChild(messageContent);
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

// Add event listener for new chat button
document.querySelector('.new-chat-btn').addEventListener('click', () => {
  // Create a new chat
  createNewChat();
});

// First-time focus on input field
window.onload = () => {
  userInput.focus();
}; 