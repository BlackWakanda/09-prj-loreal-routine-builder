/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const clearSelectionsButton = document.getElementById("clearSelections");
const userInput = document.getElementById("userInput");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

const WORKER_ENDPOINT =
  window.OPENAI_WORKER_URL ||
  window.WORKER_URL ||
  window.secrets?.OPENAI_WORKER_URL ||
  window.secrets?.WORKER_URL ||
  "";
const OPENAI_MODEL = "gpt-4o";
const SELECTED_PRODUCTS_STORAGE_KEY = "loreal-selected-product-ids";

const workerURL = "https://loreal.tukovc37.workers.dev/";

/* Keep the product data and selected products in memory. */
let allProducts = [];
let selectedProducts = [];
let expandedDescriptionIds = new Set();
let conversationMessages = [];
let routineReady = false;

const systemPrompt =
  "You are a helpful L'Oréal routine advisor. Stay focused on the current routine and on beauty-related topics like skincare, haircare, makeup, fragrance, and related routines. Use the selected products and the prior conversation as context. Keep responses clear, practical, and friendly. If the user asks about something outside beauty or the current routine, politely redirect them back to the routine or a related beauty topic.";

/* Show initial placeholder until user selects a category. */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

selectedProductsList.innerHTML = `
  <div class="empty-selected-state">No products selected yet.</div>
`;

generateRoutineButton.disabled = true;
clearSelectionsButton.disabled = true;
chatWindow.innerHTML = `
  <div class="chat-placeholder">
    Generate a routine to start the conversation.
  </div>
`;
conversationMessages = [{ role: "system", content: systemPrompt }];

function getOpenAIKey() {
  return (
    window.OPENAI_API_KEY ||
    window.OPENAI_KEY ||
    window.secrets?.OPENAI_API_KEY ||
    window.secrets?.OPENAI_KEY ||
    ""
  );
}

function saveSelectedProductIds() {
  const selectedProductIds = selectedProducts.map((product) => product.id);
  localStorage.setItem(
    SELECTED_PRODUCTS_STORAGE_KEY,
    JSON.stringify(selectedProductIds),
  );
}

function loadSelectedProductIds() {
  const storedValue = localStorage.getItem(SELECTED_PRODUCTS_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function escapeHtml(text) {
  const temporaryElement = document.createElement("div");
  temporaryElement.textContent = text;
  return temporaryElement.innerHTML;
}

function renderChatWindow() {
  const visibleMessages = conversationMessages.filter(
    (message) => message.role !== "system",
  );

  if (visibleMessages.length === 0) {
    chatWindow.innerHTML = `
      <div class="chat-placeholder">
        Generate a routine to start the conversation.
      </div>
    `;
    return;
  }

  chatWindow.innerHTML = visibleMessages
    .map(
      (message) => `
        <div class="chat-message ${message.role}">
          <div class="chat-message-label">
            ${message.role === "user" ? "You" : "L'Oréal Advisor"}
          </div>
          <div class="chat-message-content">${escapeHtml(message.content)}</div>
        </div>
      `,
    )
    .join("");

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendChatMessage(role, content) {
  conversationMessages = [...conversationMessages, { role, content }];
  renderChatWindow();
}

function resetRoutineConversation() {
  conversationMessages = [{ role: "system", content: systemPrompt }];
  routineReady = false;
  userInput.placeholder = "Ask me about products or routines…";
  renderChatWindow();
}

function getSelectedProductPayload() {
  return selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));
}

async function fetchOpenAIResponse(messages) {
  if (!WORKER_ENDPOINT) {
    throw new Error(
      "Missing Cloudflare Worker endpoint. Add it to secrets.js.",
    );
  }

  const response = await fetch(WORKER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "OpenAI request failed.";
    throw new Error(message);
  }

  const reply =
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    data?.content ||
    data?.reply ||
    (typeof data === "string" ? data : "");

  if (!reply) {
    throw new Error("The API did not return a response.");
  }

  return reply.trim();
}

/* Load product data from JSON file. */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Update the selected products section. */
function displaySelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <div class="empty-selected-state">No products selected yet.</div>
    `;
    generateRoutineButton.disabled = true;
    clearSelectionsButton.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product-item">
          <div>
            <p class="selected-product-brand">${product.brand}</p>
            <h3>${product.name}</h3>
          </div>
          <button class="remove-product-btn" type="button" data-remove-id="${product.id}">
            Remove
          </button>
        </div>
      `,
    )
    .join("");

  generateRoutineButton.disabled = false;
  clearSelectionsButton.disabled = false;
}

/* Create HTML for displaying product cards. */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found for this category
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.some(
        (item) => item.id === product.id,
      );
      const isDescriptionExpanded = expandedDescriptionIds.has(product.id);

      return `
        <article
          class="product-card ${isSelected ? "is-selected" : ""}"
          role="button"
          tabindex="0"
          data-product-id="${product.id}"
          aria-pressed="${isSelected}"
          aria-label="${product.name} by ${product.brand}. Click to ${
            isSelected ? "remove from" : "add to"
          } your selections."
        >
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <div class="product-card-topline">
              <p>${product.brand}</p>
              <span>${product.category}</span>
            </div>
            <h3>${product.name}</h3>
            <button
              class="description-toggle-btn"
              type="button"
              data-description-toggle="${product.id}"
              aria-expanded="${isDescriptionExpanded}"
              aria-controls="product-description-${product.id}"
            >
              ${isDescriptionExpanded ? "Hide description" : "View description"}
            </button>
            <div
              class="product-description ${isDescriptionExpanded ? "open" : ""}"
              id="product-description-${product.id}"
              ${isDescriptionExpanded ? "" : "hidden"}
            >
              <p>${product.description}</p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* Re-render the product grid using the currently selected category. */
function renderProducts() {
  const selectedCategory = categoryFilter.value;

  if (!selectedCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
}

/* Add or remove a product from the selected list. */
function toggleProductSelection(productId) {
  const product = allProducts.find((item) => item.id === Number(productId));

  if (!product) {
    return;
  }

  const selectedIndex = selectedProducts.findIndex(
    (item) => item.id === product.id,
  );

  if (selectedIndex === -1) {
    selectedProducts = [...selectedProducts, product];
  } else {
    selectedProducts = selectedProducts.filter(
      (item) => item.id !== product.id,
    );
  }

  saveSelectedProductIds();
  displaySelectedProducts();
  renderProducts();
}

function clearSelectedProducts() {
  selectedProducts = [];
  saveSelectedProductIds();
  displaySelectedProducts();
  renderProducts();
}

function toggleProductDescription(productId) {
  const numericId = Number(productId);

  if (expandedDescriptionIds.has(numericId)) {
    expandedDescriptionIds = new Set(
      [...expandedDescriptionIds].filter((id) => id !== numericId),
    );
  } else {
    expandedDescriptionIds = new Set([...expandedDescriptionIds, numericId]);
  }

  renderProducts();
}

function buildRoutinePrompt() {
  const selectedProductPayload = getSelectedProductPayload();

  return `Create a personalized beauty routine using only these selected products. Use the product JSON below as your source of truth. Write a practical routine with the best order of use, a morning or evening split when relevant, and brief notes explaining why each product belongs where it does.

Selected products JSON:
${JSON.stringify(selectedProductPayload, null, 2)}`;
}

function appendAssistantError(message) {
  appendChatMessage("assistant", message);
}

async function generateRoutine() {
  if (selectedProducts.length === 0) {
    appendAssistantError(
      "Select at least one product before generating a routine.",
    );
    return;
  }

  generateRoutineButton.disabled = true;
  generateRoutineButton.innerHTML =
    '<i class="fa-solid fa-wand-magic-sparkles"></i> Generating...';
  resetRoutineConversation();

  try {
    const routinePrompt = buildRoutinePrompt();
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: routinePrompt },
    ];

    const routineResponse = await fetchOpenAIResponse(messages);

    conversationMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: routinePrompt },
      { role: "assistant", content: routineResponse },
    ];
    routineReady = true;
    userInput.placeholder = "Ask a follow-up question...";
    renderChatWindow();
  } catch (error) {
    appendAssistantError(
      `I could not generate the routine right now: ${error.message}`,
    );
  } finally {
    generateRoutineButton.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine';
    generateRoutineButton.disabled = selectedProducts.length === 0;
  }
}

async function sendFollowUpQuestion(userMessage) {
  if (!routineReady) {
    appendAssistantError(
      "Generate a routine first so I can answer follow-up questions.",
    );
    return;
  }

  const requestMessages = [
    ...conversationMessages,
    { role: "user", content: userMessage },
  ];

  appendChatMessage("user", userMessage);

  try {
    const assistantReply = await fetchOpenAIResponse(requestMessages);

    appendChatMessage("assistant", assistantReply);
  } catch (error) {
    appendAssistantError(`I could not answer that just now: ${error.message}`);
  }
}

/* Handle clicks on product cards and remove buttons with event delegation. */
productsContainer.addEventListener("click", (event) => {
  const descriptionToggle = event.target.closest("[data-description-toggle]");

  if (descriptionToggle) {
    event.stopPropagation();
    toggleProductDescription(descriptionToggle.dataset.descriptionToggle);
    return;
  }

  const productCard = event.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  toggleProductSelection(productCard.dataset.productId);
});

productsContainer.addEventListener("keydown", (event) => {
  const productCard = event.target.closest(".product-card");

  if (!productCard || event.target.closest("[data-description-toggle]")) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleProductSelection(productCard.dataset.productId);
  }
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");

  if (!removeButton) {
    return;
  }

  toggleProductSelection(removeButton.dataset.removeId);
});

clearSelectionsButton.addEventListener("click", () => {
  clearSelectedProducts();
});

/* Filter and display products when category changes. */
categoryFilter.addEventListener("change", () => {
  renderProducts();
});

generateRoutineButton.addEventListener("click", () => {
  generateRoutine();
});

/* Load products once, then render the current view. */
async function initializeProducts() {
  allProducts = await loadProducts();

  const selectedProductIds = loadSelectedProductIds();
  selectedProducts = selectedProductIds
    .map((productId) =>
      allProducts.find((product) => product.id === Number(productId)),
    )
    .filter(Boolean);

  renderProducts();
  displaySelectedProducts();
}

initializeProducts();

/* Chat form submission handler - placeholder for OpenAI integration. */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();

  if (!userMessage) {
    return;
  }

  userInput.value = "";
  sendFollowUpQuestion(userMessage);
});
