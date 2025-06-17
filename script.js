// Configuration
const API_KEY = "AIzaSyDT28ot1ZVsC0zkBkhDKZoTq3HnWbkjWV8";
const API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

// Import Firestore functions (these will be available after Firebase initializes)
let getDocs, query, orderBy, doc, setDoc, Timestamp, getDoc, updateDoc, deleteDoc;

// DOM Elements
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const welcomeScreen = document.getElementById("welcome-screen");
const chatHistoryContainer = document.getElementById("chat-history");
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");
const themeToggle = document.getElementById("theme-toggle");

// Theme handling
function initTheme() {
  // Check for saved theme preference or use device preference
  const savedTheme = localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  
  // Apply the theme
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Update toggle button icon
  updateThemeIcon(savedTheme);
}

// Update theme toggle icon based on current theme
function updateThemeIcon(theme) {
  if (themeToggle) {
    themeToggle.innerHTML = theme === 'light' 
      ? '<i class="fas fa-moon"></i>' 
      : '<i class="fas fa-sun"></i>';
  }
}

// Toggle between light and dark theme
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  // Save theme preference
  localStorage.setItem('theme', newTheme);
  
  // Apply new theme
  document.documentElement.setAttribute('data-theme', newTheme);
  
  // Update toggle button icon
  updateThemeIcon(newTheme);
}

// Add event listener for theme toggle
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Initialize theme on load
initTheme();

// Initialize sidebar state based on screen size
function initSidebarState() {
  if (window.innerWidth <= 900) {
    sidebar.classList.add("collapsed");
    document.querySelector(".main-content").classList.add("full-width");
  } else {
    sidebar.classList.remove("collapsed");
    document.querySelector(".main-content").classList.remove("full-width");
  }
}

// Initialize sidebar on load and window resize
window.addEventListener('load', initSidebarState);
window.addEventListener('resize', initSidebarState);

// Mobile menu toggle
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    document.querySelector(".main-content").classList.toggle("full-width");
  });
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 900 && 
        !sidebar.classList.contains("collapsed") && 
        !sidebar.contains(e.target) && 
        e.target !== menuToggle) {
      sidebar.classList.add("collapsed");
      document.querySelector(".main-content").classList.add("full-width");
    }
  });
}

// Make sidebar clickable to toggle
sidebar.addEventListener("click", (e) => {
  // Toggle if clicking on the sidebar itself, the before or after pseudo-elements
  if (e.target === sidebar || 
      e.clientX > sidebar.getBoundingClientRect().right - 24) {
    sidebar.classList.toggle("collapsed");
    document.querySelector(".main-content").classList.toggle("full-width");
  }
});

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
let currentUser = null;

// Backoff parameters
let retryCount = 0;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000; // 1 second

// Initialize Firestore references
let chatsCollection;
let userChatsCollection;

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
  
  // Import Firestore functions from Firebase module
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
  getDocs = firestoreModule.getDocs;
  query = firestoreModule.query;
  orderBy = firestoreModule.orderBy;
  doc = firestoreModule.doc;
  setDoc = firestoreModule.setDoc;
  Timestamp = firestoreModule.Timestamp;
  getDoc = firestoreModule.getDoc;
  updateDoc = firestoreModule.updateDoc;
  deleteDoc = firestoreModule.deleteDoc;
  
  // Check authentication
  window.auth.onAuthStateChanged(async (user) => {
    if (user) {
      // User is signed in
      currentUser = user;
      
      // Initialize Firestore references
      chatsCollection = window.firestoreCollection(window.db, 'chats');
      userChatsCollection = window.firestoreCollection(window.db, 'users', user.uid, 'chats');
      
      // Load chat history
      await loadChatHistory();
      
      // Do NOT create a new chat automatically - wait for user to send a message or click "New Chat"
      // Show the welcome screen initially
      welcomeScreen.style.display = "flex";
      chatBox.style.display = "none";
      
      // Remove previous beforeunload event if it exists
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Add window unload event to clean up empty chats when user leaves
      // But only if there are no messages in the current chat
      window.addEventListener('beforeunload', handleBeforeUnload);
    } else {
      // User is signed out, redirect to login page
      window.location.href = 'login.html';
    }
  });
});

// Handle beforeunload event
function handleBeforeUnload(event) {
  // Only attempt cleanup if there's a current chat and it appears to be empty
  // (no user messages in the UI)
  if (currentChatId && !document.querySelector('.user-message')) {
    // We can't await this in beforeunload, but we can try to start the process
    // We won't delete the current chat if it has messages in Firestore
    cleanupEmptyChat(currentChatId);
  }
}

// Wait for Firebase to initialize
function waitForFirebase() {
  return new Promise((resolve) => {
    const checkFirebase = () => {
      if (window.db && window.auth && window.firestoreCollection) {
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
    const snapshot = await getDocs(query(userChatsCollection, orderBy('updatedAt', 'desc')));
    
    // Clear loading indicator
    chatHistoryContainer.innerHTML = '';
    
    if (snapshot.empty) {
      // No chats found, but don't create a new one automatically
      // Just show the welcome screen
      welcomeScreen.style.display = "flex";
      chatBox.style.display = "none";
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
    
    // Show welcome screen initially - don't create a new chat automatically
    welcomeScreen.style.display = "flex";
    chatBox.style.display = "none";
    
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

// Add chat section to sidebar
function addChatSection(title, chats) {
  // Create section header
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'history-section';
  sectionHeader.textContent = title;
  chatHistoryContainer.appendChild(sectionHeader);
  
  // Create chat items
  chats.forEach(chat => {
    const chatItem = document.createElement('div');
    chatItem.className = 'history-item';
    chatItem.dataset.id = chat.id;
    
    // Create chat item content wrapper
    const chatContent = document.createElement('div');
    chatContent.className = 'history-item-content';
    chatContent.textContent = chat.title || 'New Chat';
    
    // Create menu button
    const menuButton = document.createElement('button');
    menuButton.className = 'history-item-menu';
    menuButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    
    // Create dropdown menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'history-dropdown-menu';
    
    // Add delete option
    const deleteOption = document.createElement('div');
    deleteOption.className = 'history-dropdown-item';
    deleteOption.innerHTML = '<i class="fas fa-trash"></i> Delete';
    deleteOption.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      // Confirm deletion
      if (confirm('Are you sure you want to delete this chat?')) {
        await deleteChat(chat.id);
      }
      
      // Hide dropdown
      dropdownMenu.classList.remove('active');
    });
    
    // Add options to dropdown
    dropdownMenu.appendChild(deleteOption);
    
    // Add event listener to menu button
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Close all other dropdowns first
      document.querySelectorAll('.history-dropdown-menu.active').forEach(menu => {
        if (menu !== dropdownMenu) {
          menu.classList.remove('active');
        }
      });
      
      // Toggle this dropdown
      dropdownMenu.classList.toggle('active');
    });
    
    // Add elements to chat item
    chatItem.appendChild(chatContent);
    chatItem.appendChild(menuButton);
    chatItem.appendChild(dropdownMenu);
    
    // Add click event for selecting chat
    chatItem.addEventListener('click', () => {
      setCurrentChat(chat.id);
      
      // Close sidebar on mobile
      if (window.innerWidth <= 900) {
        sidebar.classList.remove('open');
      }
    });
    
    // Add to sidebar
    chatHistoryContainer.appendChild(chatItem);
  });
  
  // Add click event to close dropdowns when clicking elsewhere
  document.addEventListener('click', () => {
    document.querySelectorAll('.history-dropdown-menu.active').forEach(menu => {
      menu.classList.remove('active');
    });
  });
}

// Set current chat
async function setCurrentChat(chatId) {
  try {
    // If we're switching from an existing chat, check if it's empty and delete it if so
    if (currentChatId && currentChatId !== chatId) {
      await cleanupEmptyChat(currentChatId);
    }
    
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
    const chatDocRef = doc(window.db, 'chats', chatId);
    const chatDoc = await getDoc(chatDocRef);
    
    if (!chatDoc.exists()) {
      console.error("Chat not found");
      
      // Create a new chat instead
      console.log("Creating new chat as replacement");
      await createNewChat();
      
      // Show notification
      showNotification('Chat not found. Created a new chat.', 'warning');
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

// Check if a chat is empty and delete it if it is
async function cleanupEmptyChat(chatId) {
  try {
    // Skip cleanup if this is the current chat that's actively being used
    if (chatId === currentChatId && document.querySelector('.user-message')) {
      return; // Don't delete the current chat if it has messages in the UI
    }
    
    // Get chat data
    const chatDocRef = doc(window.db, 'chats', chatId);
    const chatDoc = await getDoc(chatDocRef);
    
    if (!chatDoc.exists()) {
      return; // Chat doesn't exist, nothing to clean up
    }
    
    const chat = chatDoc.data();
    
    // Check if chat has no messages
    if (!chat.messages || chat.messages.length === 0) {
      console.log("Cleaning up empty chat:", chatId);
      
      // Delete from main chats collection
      await deleteDoc(chatDocRef);
      
      // Delete from user's chats collection
      const userChatRef = doc(window.db, 'users', currentUser.uid, 'chats', chatId);
      await deleteDoc(userChatRef);
      
      // Remove from sidebar if it exists
      const chatElement = document.querySelector(`.history-item[data-id="${chatId}"]`);
      if (chatElement) {
        chatElement.remove();
      }
      
      // If this was the current chat, reset the currentChatId
      if (chatId === currentChatId) {
        currentChatId = null;
      }
    }
  } catch (error) {
    console.error("Error cleaning up empty chat:", error);
  }
}

// Create a new chat
async function createNewChat() {
  try {
    // If we're switching from an existing chat, check if it's empty and delete it if so
    if (currentChatId) {
      await cleanupEmptyChat(currentChatId);
    }
    
    if (!currentUser) {
      console.error("No user signed in");
      return;
    }
    
    // Create new chat document with auto-generated ID
    const newChatRef = doc(window.firestoreCollection(window.db, 'chats'));
    const chatId = newChatRef.id;
    
    // Set chat data
    await setDoc(newChatRef, {
      title: 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: currentUser.uid,
      messages: []
    });
    
    // Add reference to user's chats collection
    const userChatRef = doc(window.db, 'users', currentUser.uid, 'chats', chatId);
    await setDoc(userChatRef, {
      chatId: chatId,
      title: 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Set current chat ID
    currentChatId = chatId;
    
    // Reset chat history
    chatHistory = [
      { role: "system", content: "You are a math expert assistant. Only respond to math-related questions. For non-math questions, politely redirect the conversation to mathematics. Always format your answers using LaTeX for equations when appropriate. Be concise but thorough in your explanations." }
    ];
    
    // Clear chat box
    chatBox.innerHTML = '';
    
    // Show welcome screen
    welcomeScreen.style.display = "flex";
    chatBox.style.display = "none";
    
    // Don't reload chat history to prevent infinite loop
    // Instead, manually add the new chat to the sidebar
    addNewChatToSidebar(chatId);
    
    // Focus on input
    userInput.focus();
    
  } catch (error) {
    console.error("Error creating new chat:", error);
    
    // Show error notification
    showNotification('Failed to create new chat.', 'error');
  }
}

// Add new chat to sidebar without reloading all chats
function addNewChatToSidebar(chatId) {
  // Find or create Today section
  let todaySection = document.querySelector('.history-section:first-child');
  if (!todaySection || todaySection.textContent !== 'Today') {
    todaySection = document.createElement('div');
    todaySection.className = 'history-section';
    todaySection.textContent = 'Today';
    chatHistoryContainer.insertBefore(todaySection, chatHistoryContainer.firstChild);
  }
  
  // Create chat item
  const chatItem = document.createElement('div');
  chatItem.className = 'history-item active';
  chatItem.dataset.id = chatId;
  
  // Create chat item content wrapper
  const chatContent = document.createElement('div');
  chatContent.className = 'history-item-content';
  chatContent.textContent = 'New Chat';
  
  // Create menu button
  const menuButton = document.createElement('button');
  menuButton.className = 'history-item-menu';
  menuButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
  
  // Create dropdown menu
  const dropdownMenu = document.createElement('div');
  dropdownMenu.className = 'history-dropdown-menu';
  
  // Add delete option
  const deleteOption = document.createElement('div');
  deleteOption.className = 'history-dropdown-item';
  deleteOption.innerHTML = '<i class="fas fa-trash"></i> Delete';
  deleteOption.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Confirm deletion
    if (confirm('Are you sure you want to delete this chat?')) {
      await deleteChat(chatId);
    }
    
    // Hide dropdown
    dropdownMenu.classList.remove('active');
  });
  
  // Add options to dropdown
  dropdownMenu.appendChild(deleteOption);
  
  // Add event listener to menu button
  menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Close all other dropdowns first
    document.querySelectorAll('.history-dropdown-menu.active').forEach(menu => {
      if (menu !== dropdownMenu) {
        menu.classList.remove('active');
      }
    });
    
    // Toggle this dropdown
    dropdownMenu.classList.toggle('active');
  });
  
  // Add elements to chat item
  chatItem.appendChild(chatContent);
  chatItem.appendChild(menuButton);
  chatItem.appendChild(dropdownMenu);
  
  // Add click event for selecting chat
  chatItem.addEventListener('click', () => {
    setCurrentChat(chatId);
    
    // Close sidebar on mobile
    if (window.innerWidth <= 900) {
      sidebar.classList.remove('open');
    }
  });
  
  // Remove active class from all other chat items
  document.querySelectorAll('.history-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Insert new chat item after the Today section
  if (todaySection.nextSibling) {
    chatHistoryContainer.insertBefore(chatItem, todaySection.nextSibling);
  } else {
    chatHistoryContainer.appendChild(chatItem);
  }
}

// Function to send question to Gemini API
async function sendQuestion() {
  // Get user input and trim whitespace
  const question = userInput.value.trim();
  
  // Check if input is empty
  if (question === "") return;
  
  // Check if user is signed in
  if (!currentUser) {
    showNotification('Please sign in to continue', 'error');
    window.location.href = 'login.html';
    return;
  }
  
  try {
    // Check if we have a current chat ID
    if (!currentChatId) {
      // Create a new chat
      await createNewChat();
    } else {
      // Verify the chat exists
      const chatDocRef = doc(window.db, 'chats', currentChatId);
      const chatDoc = await getDoc(chatDocRef);
      
      if (!chatDoc.exists()) {
        console.log("Current chat not found, creating new one");
        await createNewChat();
      }
    }
    
    // Show chat box and hide welcome screen
    welcomeScreen.style.display = "none";
    chatBox.style.display = "flex";
    
    // Add user message to UI
    addMessageToChat("user", question);
    
    // Clear input field and reset height
    userInput.value = "";
    userInput.style.height = "auto";
    
    // Add user message to chat history
    chatHistory.push({ role: "user", content: question });
    
    // Save user message to Firestore
    await saveChatMessage({ role: "user", content: question });
    
    // Update chat title if this is the first message
    const chatDocRef = doc(window.db, 'chats', currentChatId);
    const chatDoc = await getDoc(chatDocRef);
    if (chatDoc.exists()) {
      const chat = chatDoc.data();
      if (!chat.messages || chat.messages.length <= 1) {
        updateChatTitle(question);
      }
    }
    
    // Show loading indicator
    showLoading();
    
    // Reset retry count for this new request
    retryCount = 0;
    
    // Send request to Gemini API
    const response = await sendRequestWithBackoff(question);
    
    // Process and display the response
    removeLoading();
    addMessageToChat("bot", response);
    
    // Add bot message to chat history
    chatHistory.push({ role: "assistant", content: response });
    
    // Save bot message to Firestore
    await saveChatMessage({ role: "assistant", content: response });
    
    // Render math expressions
    renderMathExpressions();
    
  } catch (error) {
    console.error("Error getting response:", error);
    
    // Remove loading indicator
    removeLoading();
    
    // Show error message
    addMessageToChat("bot", "Sorry, I couldn't process your question. Please try again.");
    
    // Add error message to chat history
    chatHistory.push({ role: "assistant", content: "Sorry, I couldn't process your question. Please try again." });
    
    // Save error message to Firestore
    await saveChatMessage({ role: "assistant", content: "Sorry, I couldn't process your question. Please try again." });
    
    // Show notification
    showNotification('An error occurred. Please try again.', 'error');
  }
}

// Update chat title based on first message
async function updateChatTitle(message) {
  try {
    // Use first 30 characters of message as title
    const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
    
    // Update chat title in main chats collection
    const chatDocRef = doc(window.db, 'chats', currentChatId);
    await updateDoc(chatDocRef, {
      title: title,
      updatedAt: new Date()
    });
    
    // Update chat title in user's chats collection
    const userChatRef = doc(window.db, 'users', currentUser.uid, 'chats', currentChatId);
    await updateDoc(userChatRef, {
      title: title,
      updatedAt: new Date()
    });
    
    // Update title in sidebar
    const historyItem = document.querySelector(`.history-item[data-id="${currentChatId}"]`);
    if (historyItem) {
      const contentElement = historyItem.querySelector('.history-item-content');
      if (contentElement) {
        contentElement.textContent = title;
      } else {
        historyItem.textContent = title;
      }
    }
    
  } catch (error) {
    console.error("Error updating chat title:", error);
  }
}

// Save chat message to Firestore
async function saveChatMessage(message) {
  try {
    // Make sure we have a valid chat ID
    if (!currentChatId) {
      console.log("Creating new chat for message");
      await createNewChat();
      
      // If still no chat ID, show error and return
      if (!currentChatId) {
        throw new Error("Failed to create chat");
      }
    }
    
    // Get current messages
    const chatDocRef = doc(window.db, 'chats', currentChatId);
    const chatDoc = await getDoc(chatDocRef);
    
    // If chat doesn't exist, create a new one
    if (!chatDoc.exists()) {
      console.log("Chat not found, creating new one");
      
      // Save current message to preserve it
      const currentMessage = message;
      
      // Create a new chat
      await createNewChat();
      
      // Save the message to the new chat
      return await saveChatMessage(currentMessage);
    }
    
    const chat = chatDoc.data();
    
    // Add message to messages array
    const messages = chat.messages || [];
    messages.push(message);
    
    // Update chat document in main chats collection
    await updateDoc(chatDocRef, {
      messages: messages,
      updatedAt: new Date()
    });
    
    // Update last updated timestamp in user's chats collection
    const userChatRef = doc(window.db, 'users', currentUser.uid, 'chats', currentChatId);
    await updateDoc(userChatRef, {
      updatedAt: new Date()
    });
    
  } catch (error) {
    console.error("Error saving chat message:", error);
    showNotification('Failed to save message', 'error');
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
    
    // Reset retry count on success
    retryCount = 0;
    
    return reply;
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
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(sendRequestWithBackoff(question));
        }, backoffTime);
      });
    }
    
    // If we've exhausted retries or it's another error, throw it up to the caller
    throw error;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
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
    // Use user's profile photo or initial if available
    if (currentUser && currentUser.photoURL) {
      avatar.innerHTML = `<img src="${currentUser.photoURL}" alt="${currentUser.displayName || 'User'}" />`;
    } else if (currentUser && currentUser.displayName) {
      avatar.innerHTML = currentUser.displayName.charAt(0).toUpperCase();
    } else {
      avatar.innerHTML = '<i class="fas fa-user"></i>';
    }
  } else {
    avatar.innerHTML = '<i class="fas fa-square-root-alt"></i>';
  }
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  
  // Process markdown and code blocks in the content
  const processedContent = processContent(content);
  messageContent.innerHTML = processedContent;
  
  // Add elements to the message div (order matters for flex-direction)
  if (role === "user") {
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
  } else {
    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(avatar);
  }
  
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
  
  // Add loading indicator to message content
  messageContent.appendChild(loadingIndicator);
  
  // Add elements in the correct order for bot message (content first, then avatar)
  loadingDiv.appendChild(messageContent);
  loadingDiv.appendChild(avatar);
  
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

// Delete chat function
async function deleteChat(chatId) {
  try {
    // Check if this is the current chat
    const isCurrentChat = chatId === currentChatId;
    
    // Delete from main chats collection
    const chatDocRef = doc(window.db, 'chats', chatId);
    await deleteDoc(chatDocRef);
    
    // Delete from user's chats collection
    const userChatRef = doc(window.db, 'users', currentUser.uid, 'chats', chatId);
    await deleteDoc(userChatRef);
    
    // Remove from UI
    const chatElement = document.querySelector(`.history-item[data-id="${chatId}"]`);
    if (chatElement) {
      chatElement.remove();
    }
    
    // If this was the current chat, show welcome screen or load another chat
    if (isCurrentChat) {
      // Reset current chat ID
      currentChatId = null;
      
      // Show welcome screen
      welcomeScreen.style.display = "flex";
      chatBox.style.display = "none";
      
      // Try to find another chat to load
      const firstChat = document.querySelector('.history-item');
      if (firstChat) {
        setCurrentChat(firstChat.dataset.id);
      }
    }
    
    // Show success notification
    showNotification('Chat deleted successfully', 'success');
    
  } catch (error) {
    console.error("Error deleting chat:", error);
    showNotification('Failed to delete chat', 'error');
  }
} 