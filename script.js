const CART_KEY = 'northgateCartItems';
const LEGACY_CART_KEY = 'northStarCartItems';
const DEMO_ACCOUNT_KEY = 'northgateDemoAccount';
const LEGACY_DEMO_ACCOUNT_KEY = 'northStarDemoAccount';
const DEMO_ORDERS_KEY = 'northgateDemoOrders';
const DELIVERY_LOCATION_KEY = 'northgateDeliveryLocation';
const LEGACY_DELIVERY_LOCATION_KEY = 'northStarDeliveryLocation';
const DELIVERY_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=700&q=80';
const PRODUCT_CATEGORIES_CLIENT = ['Home essentials', 'Electronics', 'Fashion', 'Beauty', 'Kitchen', 'Office', 'Fitness'];
let currentAccount = null;
let accountAuthMode = 'server';

function managerApiPath(path) {
  if (document.body.dataset.dashboardRole === 'seller') {
    return path.replace('/api/admin/', '/api/seller/');
  }
  return path;
}

function firebaseAccount(user) {
  if (!user || !user.emailVerified) return null;
  const displayName = user.displayName || user.email?.split('@')[0] || 'Member';
  return {
    id: user.uid,
    email: user.email || '',
    displayName,
    username: displayName,
    name: user.displayName || '',
    phone: user.phoneNumber || '',
    avatarImage: user.photoURL || '',
    createdAt: user.metadata?.creationTime || '',
    isAdmin: false,
  };
}

async function signOutCurrentAccount() {
  if (accountAuthMode === 'firebase') {
    const hostedAuth = window.northgateFirebaseAuth;
    if (!hostedAuth) {
      throw new Error('Firebase sign-out could not load. Refresh the page and try again.');
    }
    await hostedAuth.signOut();
    return;
  }

  await apiRequest('/api/logout', { method: 'POST' });
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  const requestOptions = { ...options, credentials: 'same-origin', headers };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, requestOptions);
  } catch (error) {
    throw new Error('Northgate could not reach its account server. Start it with "python server.py" and open http://127.0.0.1:8080.');
  }

  let payload = {};
  const isJsonResponse = response.headers.get('content-type')?.includes('application/json');
  if (isJsonResponse) {
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Northgate received an invalid response from its account server. Restart it with "python server.py".');
    }
  } else if (!response.ok && [405, 501].includes(response.status)) {
    throw new Error('This static web server cannot create accounts. Start Northgate with "python server.py" and open http://127.0.0.1:8080.');
  } else {
    throw new Error('Northgate received an invalid response from its account server. Start it with "python server.py" and open http://127.0.0.1:8080.');
  }

  if (!response.ok) {
    const error = new Error(
      typeof payload.error === 'string' ? payload.error : `The request failed (${response.status}). Try again.`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function normalizeImageSource(value) {
  if (!value || typeof value !== 'string') return FALLBACK_IMAGE;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/product-images/')) return value;
  if (value.startsWith('photo-')) return `https://images.unsplash.com/${value}?auto=format&fit=crop&w=700&q=80`;
  return FALLBACK_IMAGE;
}

const storage = {
  get(key, fallback, legacyKey = null) {
    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue) return JSON.parse(rawValue);
      if (legacyKey) {
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue) return JSON.parse(legacyValue);
      }
      return fallback;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  },
};

const catalogProducts = [
  { id: 'linen-cushion-set', name: 'Linen Cushion Set', category: 'Home essentials', price: 32.99, rating: '4.7', image: 'photo-1584100936595-c0654b55a2e2', alt: 'Soft decorative cushions' },
  { id: 'ceramic-table-lamp', name: 'Ceramic Table Lamp', category: 'Home essentials', price: 48.00, rating: '4.6', image: 'photo-1507473885765-e6ed057f782c', alt: 'Modern table lamp' },
  { id: 'wireless-noise-canceling-headphones', name: 'Wireless Noise-Canceling Headphones', category: 'Electronics', price: 129.99, rating: '4.8', image: 'photo-1505740420928-5e560c06d30e', alt: 'Over-ear wireless headphones' },
  { id: 'compact-bluetooth-speaker', name: 'Compact Bluetooth Speaker', category: 'Electronics', price: 54.50, rating: '4.5', image: 'photo-1608043152269-423dbba4e7e1', alt: 'Portable Bluetooth speaker' },
  { id: 'everyday-canvas-sneakers', name: 'Everyday Canvas Sneakers', category: 'Fashion', price: 68.00, rating: '4.6', image: 'photo-1542291026-7eec264c27ff', alt: 'Red athletic sneakers' },
  { id: 'classic-crossbody-bag', name: 'Classic Crossbody Bag', category: 'Fashion', price: 42.95, rating: '4.7', image: 'photo-1548036328-c9fa89d128fa', alt: 'Structured crossbody bag' },
  { id: 'hydrating-face-serum', name: 'Hydrating Face Serum', category: 'Beauty', price: 24.00, rating: '4.8', image: 'photo-1608248543803-ba4f8c70ae0b', alt: 'Skincare serum bottle' },
  { id: 'daily-glow-skin-set', name: 'Daily Glow Skin Set', category: 'Beauty', price: 38.50, rating: '4.5', image: 'photo-1556229010-6c3f2c9ca5f8', alt: 'Skincare and beauty products' },
  { id: 'pour-over-coffee-set', name: 'Pour-Over Coffee Set', category: 'Kitchen', price: 36.99, rating: '4.7', image: 'photo-1495474472287-4d71bcdd2085', alt: 'Coffee brewing setup' },
  { id: 'stainless-steel-cookware', name: 'Stainless Steel Cookware', category: 'Kitchen', price: 89.00, rating: '4.6', image: 'photo-1556911220-bff31c812dba', alt: 'Stainless steel cookware' },
  { id: 'adjustable-desk-organizer', name: 'Adjustable Desk Organizer', category: 'Office', price: 29.99, rating: '4.5', image: 'photo-1498050108023-c5249f4df085', alt: 'Organized modern desk' },
  { id: 'ergonomic-wireless-mouse', name: 'Ergonomic Wireless Mouse', category: 'Office', price: 39.95, rating: '4.7', image: 'photo-1527864550417-7fd91fc51a46', alt: 'Wireless computer mouse' },
  { id: 'insulated-steel-water-bottle', name: 'Insulated Steel Water Bottle', category: 'Fitness', price: 22.00, rating: '4.8', image: 'photo-1602143407151-7111542de6e8', alt: 'Reusable stainless water bottle' },
  { id: 'resistance-band-training-set', name: 'Resistance Band Training Set', category: 'Fitness', price: 27.50, rating: '4.6', image: 'photo-1517836357463-d25dfeac3438', alt: 'Strength training workout' },
];

const newArrivalProducts = [
  { id: 'pocket-instant-camera', name: 'Pocket Instant Camera', category: 'Electronics', price: 89.99, rating: '4.8', image: 'photo-1516035069371-29a1b244cc32', alt: 'Compact camera for everyday photos', badge: 'Just in' },
  { id: 'commuter-rolltop-backpack', name: 'Commuter Rolltop Backpack', category: 'Fashion', price: 72.00, rating: '4.7', image: 'photo-1553062407-98eeb64c6a62', alt: 'Versatile travel backpack', badge: 'Just in' },
  { id: 'ceramic-planter-trio', name: 'Ceramic Planter Trio', category: 'Home essentials', price: 34.50, rating: '4.6', image: 'photo-1485955900006-10f4d324d411', alt: 'Green indoor plant in a planter', badge: 'Just in' },
  { id: 'performance-yoga-mat', name: 'Performance Yoga Mat', category: 'Fitness', price: 39.00, rating: '4.8', image: 'photo-1599447421416-3414500d18a5', alt: 'Yoga and fitness practice', badge: 'Just in' },
  { id: 'hardcover-daily-journal', name: 'Hardcover Daily Journal', category: 'Office', price: 18.00, rating: '4.5', image: 'photo-1494438639946-1ebd1d20bf85', alt: 'Books and stationery on a desk', badge: 'Just in' },
  { id: 'relaxed-linen-shirt', name: 'Relaxed Linen Shirt', category: 'Fashion', price: 49.99, rating: '4.6', image: 'photo-1490481651871-ab68de25d43d', alt: 'Seasonal clothing collection', badge: 'Just in' },
  { id: 'glass-meal-prep-set', name: 'Glass Meal Prep Set', category: 'Kitchen', price: 32.99, rating: '4.7', image: 'photo-1546069901-ba9599a7e63c', alt: 'Freshly prepared meal', badge: 'Just in' },
  { id: 'botanical-hand-cream-trio', name: 'Botanical Hand Cream Trio', category: 'Beauty', price: 21.00, rating: '4.6', image: 'photo-1608571423902-eed4a5ad8108', alt: 'Botanical skincare products', badge: 'Just in' },
  { id: 'wireless-folding-keyboard', name: 'Wireless Folding Keyboard', category: 'Electronics', price: 44.95, rating: '4.5', image: 'photo-1516321318423-f06f85e504b3', alt: 'Portable technology for work', badge: 'Just in' },
  { id: 'sculptural-ceramic-vase', name: 'Sculptural Ceramic Vase', category: 'Home essentials', price: 28.50, rating: '4.7', image: 'photo-1578749556568-bc2c40e68b61', alt: 'Decorative ceramic vase', badge: 'Just in' },
];

const dealProducts = [
  { id: 'studio-wireless-headphones', name: 'Studio Wireless Headphones', category: 'Electronics', price: 89.99, compareAtPrice: 129.99, rating: '4.8', image: 'photo-1505740420928-5e560c06d30e', alt: 'Over-ear wireless headphones', badge: 'Save 31%' },
  { id: 'compact-air-fryer', name: 'Compact Air Fryer', category: 'Kitchen', price: 59.99, compareAtPrice: 84.99, rating: '4.7', image: 'photo-1556911220-bff31c812dba', alt: 'Modern kitchen cookware', badge: 'Save 29%' },
  { id: 'weekender-travel-bag', name: 'Weekender Travel Bag', category: 'Fashion', price: 47.99, compareAtPrice: 69.99, rating: '4.6', image: 'photo-1548036328-c9fa89d128fa', alt: 'Structured travel bag', badge: 'Save 31%' },
  { id: 'smart-desk-lamp-pro', name: 'Smart Desk Lamp Pro', category: 'Office', price: 39.99, compareAtPrice: 59.99, rating: '4.7', image: 'photo-1507473885765-e6ed057f782c', alt: 'Modern desk lamp', badge: 'Save 33%' },
  { id: 'daily-hydration-serum-set', name: 'Daily Hydration Serum Set', category: 'Beauty', price: 27.99, compareAtPrice: 39.99, rating: '4.8', image: 'photo-1608248543803-ba4f8c70ae0b', alt: 'Hydrating skincare serum', badge: 'Save 30%' },
  { id: 'adjustable-dumbbell-set', name: 'Adjustable Dumbbell Set', category: 'Fitness', price: 69.99, compareAtPrice: 99.99, rating: '4.6', image: 'photo-1517836357463-d25dfeac3438', alt: 'Strength training workout', badge: 'Save 30%' },
  { id: 'portable-bluetooth-speaker', name: 'Portable Bluetooth Speaker', category: 'Electronics', price: 42.99, compareAtPrice: 59.99, rating: '4.5', image: 'photo-1608043152269-423dbba4e7e1', alt: 'Compact Bluetooth speaker', badge: 'Save 28%' },
  { id: 'artisan-pour-over-kit', name: 'Artisan Pour-Over Kit', category: 'Kitchen', price: 28.99, compareAtPrice: 39.99, rating: '4.7', image: 'photo-1495474472287-4d71bcdd2085', alt: 'Coffee brewing setup', badge: 'Save 28%' },
];

const featuredProducts = [
  { id: 'wireless-earbuds-pro', name: 'Wireless Earbuds Pro', category: 'Electronics', price: 79.99, rating: '4.7', image: 'photo-1546868871-7041f2a55e12', alt: 'Wireless earbuds', badge: 'Best Seller' },
  { id: 'smartwatch-max', name: 'SmartWatch Max', category: 'Electronics', price: 149, rating: '4.8', image: 'photo-1523275335684-37898b6baf30', alt: 'Smartwatch', badge: 'Trending' },
  { id: 'modern-laptop-air-13', name: 'Modern Laptop Air 13', category: 'Electronics', price: 899.99, rating: '4.9', image: 'photo-1583394838336-acd977736f90', alt: 'Laptop', badge: 'Hot deal' },
  { id: 'desk-air-purifier', name: 'Desk Air Purifier', category: 'Home essentials', price: 64.99, rating: '4.6', image: 'photo-1521572267360-ee0c2909d518', alt: 'Desk air purifier', badge: 'New' },
];

const allProducts = [...featuredProducts, ...dealProducts, ...newArrivalProducts, ...catalogProducts];

function productImageUrl(product, width = 900) {
  const image = product.images?.find((item) => item.isMain)?.path || product.images?.[0]?.path || product.image;
  if (typeof image === 'string' && (image.startsWith('/') || image.startsWith('https://') || image.startsWith('http://'))) return image;
  return `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=85`;
}

function productDescription(product) {
  if (product.description?.trim()) return product.description.trim();
  const descriptions = {
    'Home essentials': 'A considered everyday upgrade for a more comfortable, thoughtfully arranged home.',
    Electronics: 'Reliable everyday technology, selected to make work, entertainment, and daily routines feel effortless.',
    Fashion: 'An easy-to-wear essential that brings practical design and considered style together.',
    Beauty: 'A simple addition to your daily routine, selected for an enjoyable, easy-to-use experience.',
    Kitchen: 'A useful kitchen essential designed to make everyday preparation a little easier.',
    Office: 'A practical workspace upgrade designed to help keep your day comfortable and organized.',
    Fitness: 'A versatile training and wellness essential to support your everyday movement routine.',
  };
  return descriptions[product.category] || 'A Northgate favorite, selected for quality, everyday usefulness, and lasting value.';
}

function productCardMarkup(product) {
  const productId = escapeHtml(encodeURIComponent(product.id));
  const productName = escapeHtml(product.name);
  const productCategory = escapeHtml(product.category);
  const hasVariants = product.variants?.length > 0;
  const allVariantsOutOfStock = hasVariants && !product.variants.some((variant) => Number(variant.stock) > 0);
  const productOutOfStock = !hasVariants && product.stock !== null && product.stock !== undefined && Number(product.stock) < 1;
  return `
    <article class="product-card" data-product-id="${escapeHtml(product.id)}" data-category="${escapeHtml(product.category.toLowerCase())}" data-search="${escapeHtml(`${product.name.toLowerCase()} ${product.category.toLowerCase()}`)}">
      ${product.badge ? `<div class="product-badge">${escapeHtml(product.badge)}</div>` : productOutOfStock ? '<div class="product-badge">Out of stock</div>' : ''}
      <a class="product-image-link" href="product.html?id=${productId}" aria-label="View ${productName} details"><img src="${escapeHtml(productImageUrl(product, 700))}" alt="${escapeHtml(product.alt || product.name)}" loading="lazy" /></a>
      <div class="product-info">
        <p class="catalog-category">${productCategory}</p>
        <h3><a class="product-detail-link" href="product.html?id=${productId}">${productName}</a></h3>
        <div class="rating" aria-label="${escapeHtml(product.rating || '4.7')} out of 5 stars">
          ${'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(product.rating) || 0))))}<span>${escapeHtml(product.rating || '4.7')}${product.reviewCount ? ` (${product.reviewCount})` : ''}</span>
        </div>
        <div class="price-row">
          ${product.compareAtPrice ? `<span class="deal-old-price">$${product.compareAtPrice.toFixed(2)}</span>` : ''}
          <span class="price">$${product.price.toFixed(2)}</span>
          <span class="prime-tag">Prime</span>
        </div>
        <button class="add-cart" type="button" ${productOutOfStock || allVariantsOutOfStock ? 'disabled' : ''}>${productOutOfStock || allVariantsOutOfStock ? 'Out of stock' : 'Add to cart'}</button>
      </div>
    </article>
  `;
}

function renderProductCollection(containerId, products) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = products.map(productCardMarkup).join('');
}

function renderCatalogProducts() {
  renderProductCollection('catalog-products', catalogProducts);
}

function renderHomepageCollections() {
  renderProductCollection('featured-products', featuredProducts);
  renderProductCollection('deal-products', dealProducts);
  renderProductCollection('new-arrivals-products', newArrivalProducts);

  const dealCount = document.getElementById('deal-product-count');
  if (dealCount) dealCount.textContent = `${dealProducts.length} offers`;
  const arrivalCount = document.getElementById('new-arrival-count');
  if (arrivalCount) arrivalCount.textContent = `${newArrivalProducts.length} fresh finds`;
}

function renderProductDetail() {
  const detailContainer = document.getElementById('product-detail');
  if (!detailContainer) return;

  const productId = new URLSearchParams(window.location.search).get('id');
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    document.title = 'Product not found | Northgate';
    detailContainer.innerHTML = `
      <div class="product-not-found">
        <p class="eyebrow">NORTHGATE CATALOG</p>
        <h1>We couldn't find that product.</h1>
        <p>It may have moved or is no longer available.</p>
        <a class="primary-btn" href="index.html#catalog">Browse the catalog</a>
      </div>
    `;
    return;
  }

  const imageUrl = productImageUrl(product);
  const productImages = product.images?.length
    ? product.images.map((image) => image.path)
    : [product.image];
  document.title = `${product.name} | Northgate`;
  const breadcrumbName = document.getElementById('product-breadcrumb-name');
  if (breadcrumbName) breadcrumbName.textContent = product.name;
  const variants = product.variants || [];
  const availableVariants = variants.filter((variant) => Number(variant.stock) > 0);
  const allOutOfStock = variants.length > 0 && availableVariants.length === 0;
  const productOutOfStock = !variants.length && product.stock !== null && product.stock !== undefined && Number(product.stock) < 1;
  const reviewCount = Number(product.reviewCount || 0);
  const productReviews = Array.isArray(product.reviews) ? product.reviews : [];
  detailContainer.innerHTML = `
    <div class="product-detail-gallery">
      <div class="product-detail-image-wrap">
      <img class="product-detail-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.alt || product.name)}" />
      </div>
      ${productImages.length > 1 ? `
        <div class="product-detail-thumbnails" aria-label="Product photos">
          ${productImages.map((path, index) => `
            <button type="button" data-product-image="${escapeHtml(productImageUrl({ image: path }))}" data-product-image-alt="${escapeHtml(product.alt || product.name)} photo ${index + 1}" aria-label="Show product photo ${index + 1}" aria-pressed="${index === 0}">
              <img src="${escapeHtml(productImageUrl({ image: path }))}" alt="" loading="lazy" />
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
    <section class="product-detail-info" aria-labelledby="product-detail-title">
      <p class="product-detail-category">${escapeHtml(product.category)}</p>
      <h1 id="product-detail-title">${escapeHtml(product.name)}</h1>
      <p class="product-detail-rating"><span aria-label="${escapeHtml(product.rating || '4.7')} out of 5 stars">${'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(product.rating) || 0))))}</span> ${escapeHtml(product.rating || '4.7')} ${reviewCount ? `from ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'customer rating'}</p>
      <p class="product-detail-price">${product.compareAtPrice ? `<span class="deal-old-price">$${product.compareAtPrice.toFixed(2)}</span> ` : ''}$${product.price.toFixed(2)}</p>
      <p class="product-detail-description">${escapeHtml(productDescription(product))}</p>
      <ul class="product-detail-points">
        <li>Selected by Northgate for everyday value</li>
        <li>Free returns within 30 days</li>
        <li>Secure checkout demonstration</li>
      </ul>
      <p class="product-detail-stock"><span aria-hidden="true"></span> ${variants.length ? `${availableVariants.length} variant${availableVariants.length === 1 ? '' : 's'} available` : productOutOfStock ? 'Out of stock' : 'In stock'}</p>
      ${variants.length ? `
        <label class="product-quantity-label" for="product-variant">Size / color</label>
        <select id="product-variant" required ${allOutOfStock ? 'disabled' : ''}>
          <option value="">Choose an option</option>
          ${variants.map((variant) => `
            <option value="${escapeHtml(variant.id)}" ${Number(variant.stock) < 1 ? 'disabled' : ''}>
              ${escapeHtml([variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku)} · ${Number(variant.stock) > 0 ? `${Number(variant.stock)} in stock` : 'Out of stock'}
            </option>
          `).join('')}
        </select>
      ` : ''}
      <label class="product-quantity-label" for="product-quantity">Quantity</label>
      <select id="product-quantity" aria-label="Quantity">
        <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
      </select>
      <button class="primary-btn product-add-cart" type="button" data-product-id="${escapeHtml(product.id)}" ${allOutOfStock || productOutOfStock ? 'disabled' : ''}>${productOutOfStock ? 'Out of stock' : 'Add to cart'}</button>
      <p id="product-variant-status" role="alert"></p>
      <p class="product-demo-note">Availability and stock are checked when you place your order.</p>
    </section>
    <section class="product-reviews" aria-labelledby="product-reviews-title">
      <header class="product-reviews-heading">
        <div>
          <p class="eyebrow">CUSTOMER FEEDBACK</p>
          <h2 id="product-reviews-title">Customer reviews</h2>
        </div>
        ${reviewCount ? `<strong>${escapeHtml(product.rating)} / 5 · ${reviewCount} review${reviewCount === 1 ? '' : 's'}</strong>` : ''}
      </header>
      ${productReviews.length
        ? `<div class="product-review-list">${productReviews.map((review) => `
            <article class="product-review">
              <div class="product-review-stars" aria-label="${Number(review.rating)} out of 5 stars">${'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</div>
              <p>${escapeHtml(review.comment)}</p>
              <span>Verified purchase · ${escapeHtml(new Date(review.createdAt).toLocaleDateString())}</span>
            </article>
          `).join('')}</div>`
        : '<p class="product-reviews-empty">No customer reviews yet. After your order is delivered, you can share your experience here.</p>'}
    </section>
  `;
  detailContainer.querySelectorAll('[data-product-image]').forEach((button) => {
    button.addEventListener('click', () => {
      const image = detailContainer.querySelector('.product-detail-image');
      image.src = button.dataset.productImage;
      image.alt = button.dataset.productImageAlt;
      detailContainer.querySelectorAll('[data-product-image]').forEach((thumbnail) => {
        thumbnail.setAttribute('aria-pressed', String(thumbnail === button));
      });
    });
  });
}

async function loadStoreCatalog() {
  try {
    const response = await apiRequest('/api/products');
    const productCollections = [featuredProducts, dealProducts, newArrivalProducts, catalogProducts];
    const knownProducts = new Map(allProducts.map((product) => [product.id, product]));
    const visibleProducts = [];
    response.products.forEach((savedProduct) => {
      const product = knownProducts.get(savedProduct.id) || {
        id: savedProduct.id,
        rating: '4.7',
        alt: savedProduct.name,
      };
      Object.assign(product, {
        name: savedProduct.name,
        category: savedProduct.category,
        price: Number(savedProduct.price),
        image: savedProduct.image,
        images: savedProduct.images,
        description: savedProduct.description,
        variants: savedProduct.variants,
        stock: savedProduct.stock,
        status: savedProduct.status,
        reviewCount: Number(savedProduct.reviewCount || 0),
        reviews: Array.isArray(savedProduct.reviews) ? savedProduct.reviews : [],
        ...(Number(savedProduct.reviewCount) > 0 ? { rating: String(savedProduct.rating) } : {}),
        alt: product.alt || savedProduct.name,
      });
      if (!knownProducts.has(savedProduct.id)) catalogProducts.push(product);
      visibleProducts.push(product);
    });
    const visibleIds = new Set(visibleProducts.map((product) => product.id));
    productCollections.forEach((collection) => {
      for (let index = collection.length - 1; index >= 0; index -= 1) {
        if (!visibleIds.has(collection[index].id)) collection.splice(index, 1);
      }
    });
    const catalogIds = new Set(catalogProducts.map((product) => product.id));
    visibleProducts.forEach((product) => {
      if (!catalogIds.has(product.id)) catalogProducts.push(product);
    });
    allProducts.splice(0, allProducts.length, ...featuredProducts, ...dealProducts, ...newArrivalProducts, ...catalogProducts);
  } catch (error) {
    console.error('Northgate could not sync the storefront catalog with the product database.', error);
  }
}

function sortCatalogProducts(cards, mode = 'featured') {
  const sorted = [...cards];
  const getPrice = (card) => Number(card.dataset.price || card.querySelector('.price')?.textContent.replace(/[^0-9.]/g, '') || 0);

  sorted.sort((firstCard, secondCard) => {
    const firstName = firstCard.querySelector('h3')?.textContent.trim() || '';
    const secondName = secondCard.querySelector('h3')?.textContent.trim() || '';

    switch (mode) {
      case 'price-asc':
        return getPrice(firstCard) - getPrice(secondCard);
      case 'price-desc':
        return getPrice(secondCard) - getPrice(firstCard);
      case 'name-asc':
        return firstName.localeCompare(secondName);
      case 'featured':
      default:
        return 0;
    }
  });

  return sorted;
}

function filterCatalog() {
  const searchInput = document.querySelector('.search-bar input');
  const cards = [...document.querySelectorAll('.product-card')];
  const resultCount = document.getElementById('catalog-result-count');
  const emptyMessage = document.getElementById('catalog-empty');
  const catalogContainer = document.getElementById('catalog-products');
  const sortSelect = document.getElementById('catalog-sort');
  const sortMode = sortSelect?.value || 'featured';
  const term = searchInput?.value.trim().toLowerCase() || '';
  const selectedCategory = document.querySelector('[data-category-filter][aria-pressed="true"]')?.dataset.categoryFilter || 'all';
  let visibleCatalogCount = 0;
  let visibleProductCount = 0;

  cards.forEach((card) => {
    const productCategory = card.dataset.category || '';
    const matchesTerm = !term || `${card.dataset.search || ''} ${card.querySelector('h3')?.textContent.toLowerCase() || ''} ${productCategory}`.includes(term);
    const matchesCategory = selectedCategory === 'all' || productCategory === selectedCategory;
    const matches = matchesTerm && matchesCategory;
    card.hidden = !matches;
    if (matches) visibleProductCount += 1;
    if (matches && card.closest('#catalog-products')) visibleCatalogCount += 1;
  });

  if (catalogContainer) {
    const allCatalogCards = [...catalogContainer.querySelectorAll('.product-card')];
    const visibleCatalogCards = allCatalogCards.filter((card) => !card.hidden);
    const sortedCatalogCards = sortCatalogProducts(visibleCatalogCards, sortMode);
    const remainingHiddenCards = allCatalogCards.filter((card) => card.hidden);

    catalogContainer.replaceChildren(...[...sortedCatalogCards, ...remainingHiddenCards]);
  }

  document.querySelectorAll('.products').forEach((section) => {
    const sectionCards = [...section.querySelectorAll('.product-card')];
    section.hidden = sectionCards.length > 0 && !sectionCards.some((card) => !card.hidden);
  });

  if (resultCount) resultCount.textContent = `${visibleCatalogCount} product${visibleCatalogCount === 1 ? '' : 's'}`;

  if (emptyMessage) {
    emptyMessage.hidden = visibleCatalogCount !== 0;
    emptyMessage.textContent = visibleProductCount
      ? 'Matching featured, deal, or new arrival products are shown above.'
      : 'No products match your search. Try a different name or category.';
  }
}

function normalizeCartItem(item) {
  if (!item || typeof item !== 'object') return null;

  const quantity = Number(item.quantity || 1);
  const price = Number(item.price || 0);
  const name = typeof item.name === 'string' ? item.name.trim() : '';

  if (!name) return null;

  return {
    ...item,
    id: item.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    price: Number.isFinite(price) ? price : 0,
    image: normalizeImageSource(item.image),
    variantId: typeof item.variantId === 'string' ? item.variantId : '',
    variantLabel: typeof item.variantLabel === 'string' ? item.variantLabel : '',
  };
}

function getCartItems() {
  const saved = storage.get(CART_KEY, [], LEGACY_CART_KEY);
  return Array.isArray(saved) ? saved.map(normalizeCartItem).filter(Boolean) : [];
}

function saveCartItems(items) {
  const nextItems = (Array.isArray(items) ? items : []).map(normalizeCartItem).filter(Boolean);
  storage.set(CART_KEY, nextItems);
}

function getDemoAccount() {
  return currentAccount;
}

function updateAccountHeader() {
  const account = getDemoAccount();
  document.querySelectorAll('.account-trigger').forEach((trigger) => {
    const avatar = trigger.querySelector('.account-avatar');
    const avatarImage = avatar?.querySelector('.account-avatar-photo');
    const avatarIcon = avatar?.querySelector('svg');
    const greeting = trigger.querySelector('.account-greeting');
    const label = trigger.querySelector('.account-copy strong');
    if (avatar) avatar.hidden = !account;
    if (avatarImage) {
      avatarImage.hidden = !account?.avatarImage;
      if (account?.avatarImage) avatarImage.src = account.avatarImage;
      else avatarImage.removeAttribute('src');
    }
    if (avatarIcon) avatarIcon.hidden = Boolean(account?.avatarImage);
    if (greeting) greeting.textContent = account ? account.displayName : 'sign in';
    if (label) label.textContent = account ? 'Your account' : 'Account & Lists';
    trigger.setAttribute('aria-label', account ? `Your account, ${account.displayName}` : 'Sign in or create account');
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function renderAccountPurchases(container) {
  if (!container) return;
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading your purchases...</div>';

  let orders;
  try {
    const response = await apiRequest('/api/orders');
    orders = response.orders;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-account-action="retry-orders">Try again</button>
      </div>
    `;
    return;
  }

  if (!orders.length) {
    container.innerHTML = `
      <div class="account-orders-empty" role="status">
        <h2>No purchases yet</h2>
        <p>Orders you place will appear here.</p>
        <a class="primary-btn" href="index.html#products">Continue shopping</a>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const placedDate = new Date(order.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const itemQuantity = items.reduce((total, item) => total + Number(item.quantity || 1), 0);
    const canCancel = order.status === 'Processing';
    const itemsMarkup = items.map((item) => {
      const name = escapeHtml(item.name);
      const image = escapeHtml(normalizeImageSource(item.image));
      const quantity = Number(item.quantity || 1);
      const lineTotal = Number(item.price || 0) * quantity;
      const review = item.review;
      const canReview = order.status === 'Delivered';
      return `
        <div class="account-order-item">
          <img src="${image}" alt="${name}" loading="lazy" />
          <div class="account-order-item-details">
            <div class="account-order-item-copy">
              <strong>${name}</strong>
              <span>Qty ${quantity}</span>
              ${item.variantLabel || item.size || item.color
                ? `<span>${escapeHtml(item.variantLabel || [item.size, item.color].filter(Boolean).join(' / '))}</span>`
                : ''}
            </div>
            ${canReview ? `
              <div class="account-product-review">
                ${review ? `
                  <div class="account-review-summary">
                    <strong aria-label="${review.rating} out of 5 stars">${'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</strong>
                    <p>${escapeHtml(review.comment)}</p>
                    <button type="button" data-order-action="write-review" aria-expanded="false">Edit review</button>
                  </div>
                ` : '<button type="button" data-order-action="write-review" class="account-review-open" aria-expanded="false">Rate &amp; review</button>'}
                <form class="account-review-form" data-review-order="${escapeHtml(order.id)}" data-review-product="${escapeHtml(item.id)}" hidden>
                  <label>Rating
                    <select name="rating" required>
                      <option value="">Choose a rating</option>
                      ${[5, 4, 3, 2, 1].map((rating) => `<option value="${rating}" ${Number(review?.rating) === rating ? 'selected' : ''}>${rating} star${rating === 1 ? '' : 's'}</option>`).join('')}
                    </select>
                  </label>
                  <label>Review
                    <textarea name="comment" rows="3" maxlength="1000" required placeholder="What did you think of this product?">${escapeHtml(review?.comment || '')}</textarea>
                  </label>
                  <p class="account-review-status" role="status" aria-live="polite"></p>
                  <button type="submit" class="account-review-submit">${review ? 'Save changes' : 'Submit review'}</button>
                </form>
              </div>
            ` : ''}
          </div>
          <strong class="account-order-item-price">$${lineTotal.toFixed(2)}</strong>
        </div>
      `;
    }).join('');

    return `
      <article class="account-order-card">
        <header class="account-order-header">
          <div>
            <strong>Order ${escapeHtml(order.id)}</strong>
            <time datetime="${escapeHtml(order.createdAt)}">Placed ${placedDate}</time>
          </div>
          <div class="account-order-actions">
            <span class="account-order-status">${escapeHtml(order.status)}</span>
            ${canCancel ? `<button class="account-order-cancel" type="button" data-order-action="start-cancel" data-order-id="${escapeHtml(order.id)}">Cancel order</button>` : ''}
          </div>
        </header>
        ${canCancel ? `
          <div class="account-order-cancel-confirm" hidden>
            <span>Cancel this demo order?</span>
            <div>
              <button type="button" data-order-action="keep-order">Keep order</button>
              <button type="button" data-order-action="confirm-cancel" data-order-id="${escapeHtml(order.id)}">Confirm cancellation</button>
            </div>
          </div>
        ` : ''}
        <div class="account-order-items">${itemsMarkup}</div>
        <footer class="account-order-footer">
          <span>${itemQuantity} item${itemQuantity === 1 ? '' : 's'}</span>
          <strong>Total $${Number(order.total || 0).toFixed(2)}</strong>
        </footer>
      </article>
    `;
  }).join('');
}

const ADMIN_ORDER_TRANSITIONS = {
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

async function renderAdminOrders(container, sellerDashboard = false) {
  if (!container) return;
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading orders...</div>';

  let orders;
  try {
    const response = await apiRequest(sellerDashboard ? '/api/seller/orders' : '/api/admin/orders');
    orders = response.orders;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-admin-action="retry">Try again</button>
      </div>
    `;
    return;
  }

  if (!orders.length) {
    container.innerHTML = `
      <header class="admin-orders-heading">
        <div><p class="eyebrow">FULFILLMENT</p><h2>${sellerDashboard ? 'Sales &amp; orders' : 'Order management'}</h2><p>${sellerDashboard ? 'See when customers buy your products and check order status.' : 'Review purchases, customer details, and fulfillment progress.'}</p></div>
        <button type="button" class="secondary-btn" data-admin-action="retry">Refresh ${sellerDashboard ? 'sales' : 'orders'}</button>
      </header>
      <div class="admin-orders-empty" role="status">
        <span aria-hidden="true">▤</span>
        <h2>${sellerDashboard ? 'No sales yet' : 'No orders yet'}</h2>
        <p>${sellerDashboard ? 'When a customer buys one of your products, the order will appear here.' : 'New customer orders will appear here when they are placed.'}</p>
      </div>
    `;
    return;
  }

  const counts = {
    all: orders.length,
    processing: orders.filter((order) => order.status === 'Processing').length,
    shipped: orders.filter((order) => order.status === 'Shipped').length,
    delivered: orders.filter((order) => order.status === 'Delivered').length,
    cancelled: orders.filter((order) => order.status === 'Cancelled').length,
  };
  const sellerSales = orders.reduce(
    (total, order) => total + order.items.reduce((orderTotal, item) => orderTotal + Number(item.price) * Number(item.quantity), 0),
    0
  );

  container.innerHTML = `
    <header class="admin-orders-heading">
      <div>
        <p class="eyebrow">FULFILLMENT</p>
        <h2>${sellerDashboard ? 'Sales &amp; orders' : 'Order management'}</h2>
        <p>${sellerDashboard ? 'See when customers buy your products and check order status.' : 'Review purchases, customer details, and fulfillment progress.'}</p>
      </div>
      <button type="button" class="secondary-btn" data-admin-action="retry">Refresh ${sellerDashboard ? 'sales' : 'orders'}</button>
    </header>
    <div class="admin-order-summary" aria-label="Order summary">
      <article class="admin-order-stat"><span class="admin-order-stat-icon is-total" aria-hidden="true">▤</span><div><span>Total orders</span><strong>${counts.all}</strong></div></article>
      <article class="admin-order-stat"><span class="admin-order-stat-icon is-processing" aria-hidden="true">◷</span><div><span>To fulfill</span><strong>${counts.processing}</strong></div></article>
      <article class="admin-order-stat"><span class="admin-order-stat-icon is-shipped" aria-hidden="true">↗</span><div><span>In transit</span><strong>${counts.shipped}</strong></div></article>
      <article class="admin-order-stat"><span class="admin-order-stat-icon is-delivered" aria-hidden="true">✓</span><div><span>Delivered</span><strong>${counts.delivered}</strong></div></article>
      ${sellerDashboard
        ? `<article class="admin-order-stat"><span class="admin-order-stat-icon is-revenue" aria-hidden="true">$</span><div><span>Your product sales</span><strong>$${sellerSales.toFixed(2)}</strong></div></article>`
        : `<article class="admin-order-stat"><span class="admin-order-stat-icon is-cancelled" aria-hidden="true">×</span><div><span>Cancelled</span><strong>${counts.cancelled}</strong></div></article>`}
    </div>
    <div class="admin-orders-toolbar">
      <div><h3>${sellerDashboard ? 'Orders with your products' : 'All orders'}</h3><p id="admin-orders-result-count">${orders.length} order${orders.length === 1 ? '' : 's'}</p></div>
      <div class="admin-order-filters">
        <label class="admin-order-search"><span aria-hidden="true">⌕</span><span class="sr-only">Search orders</span><input id="admin-order-search" type="search" placeholder="Order ID, customer, or email" /></label>
        <label class="sr-only" for="admin-order-status-filter">Filter orders by status</label>
        <select id="admin-order-status-filter" aria-label="Filter orders by status">
          <option value="all">All statuses</option>
          <option value="Processing">To fulfill</option>
          <option value="Shipped">In transit</option>
          <option value="Delivered">Delivered</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
    </div>
    <div class="admin-order-list" id="admin-order-list" aria-live="polite"></div>
  `;

  const renderOrders = () => {
    const search = container.querySelector('#admin-order-search').value.trim().toLowerCase();
    const status = container.querySelector('#admin-order-status-filter').value;
    const filteredOrders = orders.filter((order) => {
      const searchText = `${order.id} ${order.customerName} ${order.customerEmail} ${order.phone}`.toLowerCase();
      return (!search || searchText.includes(search)) && (status === 'all' || order.status === status);
    });
    container.querySelector('#admin-orders-result-count').textContent =
      search || status !== 'all'
        ? `Showing ${filteredOrders.length} of ${orders.length} orders`
        : `${orders.length} order${orders.length === 1 ? '' : 's'}`;

    const orderList = container.querySelector('#admin-order-list');
    if (!filteredOrders.length) {
      orderList.innerHTML = `
        <div class="admin-orders-empty" role="status">
          <span aria-hidden="true">⌕</span>
          <h2>No matching orders</h2>
          <p>Try another search or choose a different status.</p>
        </div>
      `;
      return;
    }

    orderList.innerHTML = filteredOrders.map((order) => {
    const nextStatuses = ADMIN_ORDER_TRANSITIONS[order.status] || [];
    const itemCount = order.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
    const address = order.address;
    const formattedAddress = [
      address.street,
      `${address.city} ${address.postalCode}`.trim(),
      address.country,
    ].filter(Boolean).join(', ');
    const statusClass = order.status.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const placedDate = new Date(order.createdAt).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return `
      <article class="account-order-card admin-order-card admin-order-status-${escapeHtml(statusClass)}">
        <header class="account-order-header">
          <div class="admin-order-reference">
            <span>ORDER</span>
            <strong>${escapeHtml(order.id)}</strong>
            <time datetime="${escapeHtml(order.createdAt)}">Placed ${escapeHtml(placedDate)}</time>
          </div>
          <span class="account-order-status admin-order-status-badge"><span aria-hidden="true"></span>${escapeHtml(order.status)}</span>
        </header>
        <div class="admin-order-details">
          <section class="admin-order-customer" aria-label="Customer information">
            <h4>Customer</h4>
            <strong>${escapeHtml(order.customerName)}</strong>
            <a href="mailto:${escapeHtml(order.customerEmail)}">${escapeHtml(order.customerEmail)}</a>
            ${order.phone ? `<a href="tel:${encodeURIComponent(order.phone)}">${escapeHtml(order.phone)}</a>` : ''}
          </section>
          <section class="admin-order-delivery" aria-label="Delivery address">
            <h4>Ship to</h4>
            <p>${escapeHtml(formattedAddress)}</p>
          </section>
        </div>
        <div class="admin-order-items">
          <div class="admin-order-items-heading"><h4>Items</h4><span>${itemCount} item${itemCount === 1 ? '' : 's'}</span></div>
          ${order.items.map((item) => `
            <div class="admin-order-item">
              <span class="admin-order-item-copy">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${item.variantSku ? `SKU ${escapeHtml(item.variantSku)} · ` : ''}${item.size || item.color ? `${escapeHtml([item.size, item.color].filter(Boolean).join(' / '))} · ` : ''}Qty ${Number(item.quantity)} × $${Number(item.price).toFixed(2)}</small>
              </span>
              <strong class="admin-order-item-total">$${(Number(item.price) * Number(item.quantity)).toFixed(2)}</strong>
            </div>
          `).join('')}
        </div>
        <footer class="account-order-footer admin-order-footer">
          <span>${sellerDashboard ? 'Your product total' : 'Order total'}</span>
          <strong>$${Number(sellerDashboard ? order.subtotal : order.total).toFixed(2)}</strong>
        </footer>
        ${sellerDashboard
          ? '<p class="admin-order-terminal"><span aria-hidden="true">i</span>Order status updates are managed by the store administrator.</p>'
          : nextStatuses.length ? `
          <form class="admin-order-status-form" data-admin-order-id="${escapeHtml(order.id)}">
            <label class="admin-order-status-label">
              <span>Update fulfillment</span>
              <select name="status" required>
                <option value="" selected disabled>Choose next status</option>
                ${nextStatuses.map((nextStatus) => `<option value="${escapeHtml(nextStatus)}">${escapeHtml(nextStatus)}</option>`).join('')}
              </select>
            </label>
            <button class="secondary-btn" type="submit">Save status</button>
          </form>
        ` : `<p class="admin-order-terminal"><span aria-hidden="true">${order.status === 'Delivered' ? '✓' : '!'}</span>${order.status === 'Delivered' ? 'This order has been delivered.' : 'This order was cancelled.'}</p>`}
      </article>
    `;
    }).join('');
  };

  container.querySelector('#admin-order-search').addEventListener('input', renderOrders);
  container.querySelector('#admin-order-status-filter').addEventListener('change', renderOrders);
  renderOrders();
}

const adminProductState = {
  products: [],
  page: 1,
  pageSize: 10,
  status: 'all',
};

function getAdminProductStock(product) {
  if (product.variants.length) {
    return product.variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
  }
  return product.stock === null ? 0 : Number(product.stock || 0);
}

function filteredAdminProducts() {
  const status = adminProductState.status;
  const sort = document.getElementById('admin-product-sort')?.value || 'updated';
  const search = document.getElementById('admin-product-search')?.value.trim().toLowerCase() || '';
  const products = adminProductState.products.filter((product) => {
    const matchesStatus = status === 'all' || product.status === status;
    const searchable = [
      product.name,
      product.category,
      ...product.variants.map((variant) => variant.sku),
    ].join(' ').toLowerCase();
    return matchesStatus && (!search || searchable.includes(search));
  });
  products.sort((first, second) => {
    if (sort === 'name') return first.name.localeCompare(second.name);
    if (sort === 'price') return Number(first.price) - Number(second.price);
    if (sort === 'stock') return getAdminProductStock(first) - getAdminProductStock(second);
    if (sort === 'created') return String(second.createdAt).localeCompare(String(first.createdAt));
    return String(second.updatedAt).localeCompare(String(first.updatedAt));
  });
  return products;
}

async function loadAdminUsers() {
  const container = document.getElementById('admin-user-list');
  const count = document.getElementById('admin-users-status');
  const search = document.getElementById('admin-user-search');
  const roleFilter = document.getElementById('admin-user-role-filter');
  if (!container || !count) return;

  count.textContent = 'Loading accounts...';
  ['admin-users-total', 'admin-users-customers', 'admin-users-sellers', 'admin-users-verified'].forEach((id) => {
    const summary = document.getElementById(id);
    if (summary) summary.textContent = '—';
  });
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading registered users...</div>';
  try {
    const response = await apiRequest('/api/admin/users');
    const users = response.users;
    document.getElementById('admin-users-total').textContent = String(users.length);
    document.getElementById('admin-users-customers').textContent = String(
      users.filter((user) => user.role === 'customer').length
    );
    document.getElementById('admin-users-sellers').textContent = String(
      users.filter((user) => user.role === 'seller').length
    );
    document.getElementById('admin-users-verified').textContent = String(
      users.filter((user) => user.emailVerified).length
    );
    const render = () => {
      const query = search?.value.trim().toLowerCase() || '';
      const selectedRole = roleFilter?.value || 'all';
      const filteredUsers = users.filter((user) => {
        const matchesQuery = `${user.username} ${user.name} ${user.email}`.toLowerCase().includes(query);
        return matchesQuery && (selectedRole === 'all' || user.role === selectedRole);
      });
      count.textContent = query || selectedRole !== 'all'
        ? `Showing ${filteredUsers.length} of ${users.length} accounts`
        : `${users.length} account${users.length === 1 ? '' : 's'} total`;
      if (!filteredUsers.length) {
        container.innerHTML = `<div class="admin-users-empty" role="status"><span aria-hidden="true">⌕</span><h2>${users.length ? 'No matching accounts' : 'No accounts yet'}</h2><p>${users.length ? 'Try another search or choose a different role filter.' : 'Newly registered customer and seller accounts will appear here.'}</p></div>`;
        return;
      }
      container.innerHTML = `
        <table class="admin-user-table">
          <thead><tr><th scope="col">USER</th><th scope="col">EMAIL ADDRESS</th><th scope="col">ROLE</th><th scope="col">EMAIL STATUS</th><th scope="col">JOINED</th></tr></thead>
          <tbody>${filteredUsers.map((user) => `
            <tr>
              <td>
                <div class="admin-user-identity">
                  <span class="admin-user-avatar" aria-hidden="true">${escapeHtml((user.name || user.username || user.email).trim().slice(0, 1).toUpperCase())}</span>
                  <span><strong>${escapeHtml(user.name || user.username)}</strong><small>@${escapeHtml(user.username)}</small></span>
                </div>
              </td>
              <td><a class="admin-user-email" href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a></td>
              <td><span class="admin-user-role admin-user-role-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span></td>
              <td><span class="admin-user-verification ${user.emailVerified ? 'is-verified' : 'is-unverified'}"><span aria-hidden="true">${user.emailVerified ? '✓' : '!'}</span>${user.emailVerified ? 'Verified' : 'Unverified'}</span></td>
              <td><time class="admin-user-date" datetime="${escapeHtml(user.createdAt)}">${escapeHtml(new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</time></td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    };
    if (search) search.oninput = render;
    if (roleFilter) roleFilter.onchange = render;
    render();
  } catch (error) {
    count.textContent = '';
    container.innerHTML = `<div class="admin-users-empty account-state-error" role="alert"><h2>Could not load user accounts</h2><p>${escapeHtml(error.message)}</p><button type="button" class="secondary-btn" data-admin-users-retry>Try again</button></div>`;
  }
}

function renderAdminProductList() {
  const list = document.getElementById('admin-product-list');
  const pagination = document.getElementById('admin-product-pagination');
  if (!list || !pagination) return;
  document.querySelectorAll('[data-product-status-count]').forEach((count) => {
    const status = count.dataset.productStatusCount;
    count.textContent = String(
      status === 'all'
        ? adminProductState.products.length
        : adminProductState.products.filter((product) => product.status === status).length
    );
  });
  const products = filteredAdminProducts();
  const pageCount = Math.max(1, Math.ceil(products.length / adminProductState.pageSize));
  adminProductState.page = Math.min(adminProductState.page, pageCount);
  const pageStart = (adminProductState.page - 1) * adminProductState.pageSize;
  const pageProducts = products.slice(pageStart, pageStart + adminProductState.pageSize);
  const statusMessage = document.getElementById('admin-products-status');
  if (statusMessage) {
    const lowStockCount = products.filter((product) => (
      product.variants.length
        ? product.variants.some((variant) => Number(variant.stock) <= Number(product.lowStockThreshold))
        : product.stock !== null && Number(product.stock) <= Number(product.lowStockThreshold)
    )).length;
    statusMessage.textContent = `${products.length} product${products.length === 1 ? '' : 's'} · ${lowStockCount} with low stock`;
  }
  if (!products.length) {
    list.innerHTML = '<div class="account-orders-empty" role="status"><h2>No products found</h2><p>Add a product or adjust your filters.</p></div>';
    pagination.innerHTML = '';
    return;
  }

  list.innerHTML = `
    <div class="admin-product-table-wrap">
      <table class="admin-product-table">
        <thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Inventory</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          ${pageProducts.map((product) => {
            const stock = getAdminProductStock(product);
            const lowVariants = product.variants.filter((variant) => Number(variant.stock) <= Number(product.lowStockThreshold));
            const productLowStock = !product.variants.length
              && product.stock !== null
              && Number(product.stock) <= Number(product.lowStockThreshold);
            const preview = product.images?.[0]?.path || product.image;
            const variantRows = product.variants.length
              ? product.variants.map((variant) => `
                <form class="admin-quick-stock" data-admin-stock-product="${escapeHtml(product.id)}" data-admin-stock-variant="${escapeHtml(variant.id)}">
                  <span>${escapeHtml([variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku)} <small>SKU ${escapeHtml(variant.sku)}</small></span>
                  <label><span class="sr-only">Stock for ${escapeHtml(variant.sku)}</span><input type="number" min="0" max="1000000" step="1" value="${Number(variant.stock)}" name="stock" required /></label>
                  <button type="submit" class="subtle">Save</button>
                </form>
              `).join('')
              : `
                <form class="admin-quick-stock" data-admin-stock-product="${escapeHtml(product.id)}">
                  <span>${product.stock === null ? 'Stock not tracked' : 'Product stock'}</span>
                  <label><span class="sr-only">Product stock for ${escapeHtml(product.name)}</span><input type="number" min="0" max="1000000" step="1" value="${product.stock ?? ''}" name="stock" required /></label>
                  <button type="submit" class="subtle">Save</button>
                </form>
              `;
            const activityRows = product.activity?.length
              ? product.activity.map((activity) => `<li><time>${escapeHtml(new Date(activity.createdAt).toLocaleString())}</time><strong>${escapeHtml(activity.action)}</strong><span>${escapeHtml(activity.details)}</span><small>${escapeHtml(activity.actorEmail)}</small></li>`).join('')
              : '<li>No changes recorded yet.</li>';
            return `
              <tr>
                <td>
                  <div class="admin-product-identity">
                    <input type="checkbox" data-product-select value="${escapeHtml(product.id)}" aria-label="Select ${escapeHtml(product.name)}" />
                    <img src="${escapeHtml(productImageUrl({ image: preview }, 120))}" alt="" loading="lazy" />
                    <div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.category)}</span><details class="admin-product-activity"><summary>Activity</summary><ol>${activityRows}</ol></details></div>
                  </div>
                </td>
                <td><strong class="admin-product-price">$${Number(product.price).toFixed(2)}</strong></td>
                <td>
                  <div class="admin-product-inventory">
                    <strong>${product.variants.length || product.stock !== null ? `${stock} units` : 'Not tracked'}</strong>
                    <span>${product.variants.length ? `${product.variants.length} stock option${product.variants.length === 1 ? '' : 's'}` : product.stock !== null ? 'Single inventory level' : 'Inventory tracking is off'}</span>
                  </div>
                  ${lowVariants.length ? `<span class="admin-low-stock">Low stock · ${lowVariants.length} option${lowVariants.length === 1 ? '' : 's'}</span>` : productLowStock ? '<span class="admin-low-stock">Low stock</span>' : ''}
                  <details class="admin-product-stock-editor">
                    <summary>Manage stock</summary>
                    <div class="admin-variant-stock-list">${variantRows}</div>
                  </details>
                </td>
                <td><span class="admin-product-status admin-status-${escapeHtml(product.status)}"><span aria-hidden="true"></span>${escapeHtml(product.status)}</span></td>
                <td><div class="admin-product-row-actions">
                  <button type="button" class="subtle" data-product-action="edit" data-product-id="${escapeHtml(product.id)}">Edit</button>
                  ${product.status === 'archived'
                    ? '<button type="button" class="subtle" data-product-action="restore" data-product-id="' + escapeHtml(product.id) + '">Restore</button>'
                    : '<button type="button" class="subtle" data-product-action="archive" data-product-id="' + escapeHtml(product.id) + '">Archive</button>'}
                </div></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  const selectedIds = new Set([...list.querySelectorAll('[data-product-select]:checked')].map((input) => input.value));
  pagination.innerHTML = `
    <span>Showing ${pageStart + 1}–${Math.min(pageStart + pageProducts.length, products.length)} of ${products.length}</span>
    <button type="button" data-product-page="${adminProductState.page - 1}" ${adminProductState.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${adminProductState.page} of ${pageCount}</span>
    <button type="button" data-product-page="${adminProductState.page + 1}" ${adminProductState.page >= pageCount ? 'disabled' : ''}>Next</button>
  `;
  const selectAll = document.getElementById('admin-product-select-all');
  if (selectAll) {
    selectAll.checked = pageProducts.length > 0 && pageProducts.every((product) => selectedIds.has(product.id));
    selectAll.indeterminate = selectedIds.size > 0 && !selectAll.checked;
  }
}

async function loadAdminProducts() {
  const list = document.getElementById('admin-product-list');
  if (list) list.innerHTML = '<div class="account-state account-state-loading" role="status">Loading products...</div>';
  try {
    const response = await apiRequest(managerApiPath('/api/admin/products'));
    adminProductState.products = response.products;
    renderAdminProductList();
  } catch (error) {
    if (list) {
      list.innerHTML = `<div class="account-state account-state-error" role="alert"><p>${escapeHtml(error.message)}</p><button type="button" data-admin-product-action="retry">Try again</button></div>`;
    }
  }
}

function renderAdminVariantRows(variants = []) {
  const container = document.getElementById('admin-variant-rows');
  if (!container) return;
  container.innerHTML = variants.map((variant) => `
    <div class="admin-variant-row">
      <label>Size<input name="variantSize" maxlength="40" value="${escapeHtml(variant.size || '')}" placeholder="S, M, L" /></label>
      <label>Color<input name="variantColor" maxlength="40" value="${escapeHtml(variant.color || '')}" placeholder="Natural" /></label>
      <label>SKU<input name="variantSku" maxlength="80" value="${escapeHtml(variant.sku || '')}" required /></label>
      <label>Stock<input name="variantStock" type="number" min="0" max="1000000" step="1" value="${Number(variant.stock ?? 0)}" required /></label>
      <button type="button" class="subtle" data-variant-action="remove" aria-label="Remove variant">Remove</button>
    </div>
  `).join('');
}

function showAdminProductForm(product = null) {
  const form = document.getElementById('admin-product-form');
  if (!form) return;
  form.reset();
  form.elements.id.value = product?.id || '';
  form.elements.name.value = product?.name || '';
  form.elements.category.value = product?.category || 'Fashion';
  form.elements.price.value = product?.price ?? '';
  form.elements.status.value = product?.status || 'draft';
  form.elements.lowStockThreshold.value = product?.lowStockThreshold ?? 5;
  form.elements.stock.value = product?.stock ?? (product ? '' : 0);
  form.elements.description.value = product?.description || '';
  form.elements.imageUrls.value = (product?.images || []).map((image) => image.path).join('\n') || product?.image || '';
  form.elements.photos.value = '';
  document.getElementById('admin-product-form-title').textContent = product ? 'Edit product' : 'Add product';
  document.getElementById('admin-product-form-status').textContent = '';
  renderAdminVariantRows(product?.variants || []);
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.name.focus();
}

function readProductImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function initializeAdminProducts() {
  const panel = document.getElementById('admin-products');
  const form = document.getElementById('admin-product-form');
  if (!panel || !form) return;
  const status = document.getElementById('admin-products-feedback');
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  loadAdminProducts();
  document.querySelector('.admin-tabs')?.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (!tab) return;
    const selectedTab = tab.dataset.adminTab;
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      const selected = button === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('admin-products').hidden = selectedTab !== 'products';
    document.getElementById('admin-orders').hidden = selectedTab !== 'orders';
    const usersPanel = document.getElementById('admin-users');
    if (usersPanel) usersPanel.hidden = selectedTab !== 'users';
    if (selectedTab === 'orders' && currentAccount && (currentAccount.isAdmin || document.body.dataset.dashboardRole === 'seller')) {
      await renderAdminOrders(
        document.getElementById('admin-orders'),
        document.body.dataset.dashboardRole === 'seller'
      );
    }
    if (selectedTab === 'users' && currentAccount?.isAdmin) await loadAdminUsers();
  });

  panel.addEventListener('click', async (event) => {
    const statusTab = event.target.closest('[data-product-status-tab]');
    if (statusTab) {
      adminProductState.status = statusTab.dataset.productStatusTab;
      adminProductState.page = 1;
      document.querySelectorAll('[data-product-status-tab]').forEach((button) => {
        const selected = button === statusTab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      renderAdminProductList();
      return;
    }
    const close = event.target.closest('[data-product-form-close]');
    if (close) {
      form.hidden = true;
      return;
    }
    const add = event.target.closest('#admin-product-add');
    if (add) {
      showAdminProductForm();
      return;
    }
    const pageButton = event.target.closest('[data-product-page]');
    if (pageButton) {
      adminProductState.page = Number(pageButton.dataset.productPage);
      renderAdminProductList();
      return;
    }
    const variantAction = event.target.closest('[data-variant-action]');
    if (variantAction) {
      const container = document.getElementById('admin-variant-rows');
      if (variantAction.dataset.variantAction === 'add') {
        const row = document.createElement('div');
        row.className = 'admin-variant-row';
        row.innerHTML = '<label>Size<input name="variantSize" maxlength="40" placeholder="S, M, L" /></label><label>Color<input name="variantColor" maxlength="40" placeholder="Natural" /></label><label>SKU<input name="variantSku" maxlength="80" required /></label><label>Stock<input name="variantStock" type="number" min="0" max="1000000" step="1" value="0" required /></label><button type="button" class="subtle" data-variant-action="remove" aria-label="Remove variant">Remove</button>';
        container.append(row);
      } else {
        variantAction.closest('.admin-variant-row')?.remove();
      }
      return;
    }
    const action = event.target.closest('[data-product-action]');
    if (action) {
      const product = adminProductState.products.find((item) => item.id === action.dataset.productId);
      if (!product) return;
      try {
        if (action.dataset.productAction === 'edit') {
          showAdminProductForm(product);
        } else if (action.dataset.productAction === 'archive') {
          if (!window.confirm(`Archive "${product.name}"? It will be hidden from the shop and can be restored later.`)) return;
          await apiRequest(managerApiPath(`/api/admin/products/${encodeURIComponent(product.id)}/status`), {
            method: 'PUT',
            body: { status: 'archived' },
          });
          setStatus(`${product.name} archived. Restore it from the Archived filter.`);
          await loadAdminProducts();
        } else if (action.dataset.productAction === 'restore') {
          await apiRequest(managerApiPath(`/api/admin/products/${encodeURIComponent(product.id)}/status`), {
            method: 'PUT',
            body: { status: 'restore' },
          });
          const restoredStatus = product.archivedFromStatus || 'active';
          setStatus(`${product.name} restored as ${restoredStatus}.`);
          await loadAdminProducts();
        }
      } catch (error) {
        setStatus(error.message);
      }
      return;
    }
    if (event.target.closest('[data-admin-product-action="retry"]')) await loadAdminProducts();
  });

  ['admin-product-sort', 'admin-product-search'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      adminProductState.page = 1;
      renderAdminProductList();
    });
  });
  document.getElementById('admin-product-select-all')?.addEventListener('change', (event) => {
    document.querySelectorAll('#admin-product-list [data-product-select]').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });
  document.getElementById('admin-product-list')?.addEventListener('change', (event) => {
    if (event.target.matches('[data-product-select]')) {
      const selected = [...document.querySelectorAll('#admin-product-list [data-product-select]')];
      const selectAll = document.getElementById('admin-product-select-all');
      selectAll.checked = selected.length > 0 && selected.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = selected.some((checkbox) => checkbox.checked) && !selectAll.checked;
    }
  });
  document.getElementById('admin-product-bulk')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const bulkForm = event.currentTarget;
    const selectedIds = [...document.querySelectorAll('#admin-product-list [data-product-select]:checked')].map((input) => input.value);
    const action = bulkForm.elements.action.value;
    const value = bulkForm.elements.value.value;
    const stockValue = Number(bulkForm.elements.stockValue.value);
    if (!selectedIds.length) {
      setStatus('Select at least one product on this page.');
      return;
    }
    if (['status', 'category'].includes(action) && !value) {
      setStatus('Choose a status or category for the selected products.');
      return;
    }
    if (action === 'stock' && (!Number.isInteger(stockValue) || stockValue < 0 || stockValue > 1000000)) {
      setStatus('Variant stock must be between 0 and 1,000,000.');
      return;
    }
    if (action === 'archive' && !window.confirm(`Archive ${selectedIds.length} selected product${selectedIds.length === 1 ? '' : 's'}?`)) return;
    try {
      await apiRequest(managerApiPath('/api/admin/products/bulk'), {
        method: 'POST',
        body: {
          productIds: selectedIds,
          action,
          ...(action === 'status' ? { status: value } : {}),
          ...(action === 'category' ? { category: value } : {}),
          ...(action === 'stock' ? { stock: stockValue } : {}),
        },
      });
      setStatus(`${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} updated.`);
      await loadAdminProducts();
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('admin-product-bulk')?.elements.action.addEventListener('change', (event) => {
    const valueSelect = document.getElementById('admin-product-bulk').elements.value;
    const action = event.target.value;
    [...valueSelect.options].forEach((option) => {
      if (!option.value) return;
      option.hidden = action === 'status'
        ? !['active', 'draft', 'archived'].includes(option.value)
        : action === 'category'
          ? !PRODUCT_CATEGORIES_CLIENT.includes(option.value)
          : true;
    });
    valueSelect.hidden = !['status', 'category'].includes(action);
    const stockField = document.getElementById('admin-product-stock-bulk-field');
    stockField.hidden = action !== 'stock';
    document.getElementById('admin-product-bulk').elements.stockValue.hidden = action !== 'stock';
    valueSelect.value = '';
  });
  document.getElementById('admin-product-list')?.addEventListener('submit', async (event) => {
    const stockForm = event.target.closest('[data-admin-stock-product]');
    if (!stockForm) return;
    event.preventDefault();
    const saveButton = stockForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      await apiRequest(
        managerApiPath(`/api/admin/products/${encodeURIComponent(stockForm.dataset.adminStockProduct)}/stock${stockForm.dataset.adminStockVariant ? `/${encodeURIComponent(stockForm.dataset.adminStockVariant)}` : ''}`),
        { method: 'PUT', body: { stock: Number(stockForm.elements.stock.value) } },
      );
      setStatus('Variant stock updated.');
      await loadAdminProducts();
    } catch (error) {
      setStatus(error.message);
      saveButton.disabled = false;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formStatus = document.getElementById('admin-product-form-status');
    const formData = new FormData(form);
    const files = [...form.elements.photos.files];
    submitButton.disabled = true;
    formStatus.textContent = 'Saving product...';
    try {
      let imagePaths = String(formData.get('imageUrls') || '').split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
      if (files.length) {
        if (files.length + imagePaths.length > 5) throw new Error('Use no more than 5 photos in total.');
        const uploads = [];
        for (const file of files) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Photos must be JPEG, PNG, or WebP images.');
          if (file.size > 250000) throw new Error('Each photo must be 250 KB or smaller.');
          uploads.push({ type: file.type, data: await readProductImage(file) });
        }
        const response = await apiRequest(managerApiPath('/api/admin/product-images'), {
          method: 'POST',
          body: { files: uploads },
        });
        imagePaths = imagePaths.concat(response.images);
      }
      const variants = [...form.querySelectorAll('.admin-variant-row')].map((row) => ({
        size: row.querySelector('[name="variantSize"]').value.trim(),
        color: row.querySelector('[name="variantColor"]').value.trim(),
        sku: row.querySelector('[name="variantSku"]').value.trim(),
        stock: Number(row.querySelector('[name="variantStock"]').value),
      })).filter((variant) => variant.sku || variant.size || variant.color);
      const payload = {
        name: formData.get('name'),
        category: formData.get('category'),
        price: Number(formData.get('price')),
        description: formData.get('description'),
        status: formData.get('status'),
        lowStockThreshold: Number(formData.get('lowStockThreshold')),
        stock: String(formData.get('stock') || '').trim() === '' ? null : Number(formData.get('stock')),
        images: imagePaths,
        variants,
      };
      const id = String(formData.get('id') || '');
      await apiRequest(managerApiPath(id ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products'), {
        method: id ? 'PUT' : 'POST',
        body: payload,
      });
      form.hidden = true;
      setStatus(id ? 'Product changes saved.' : 'Product created.');
      await loadAdminProducts();
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function initializeAdminPage() {
  const ordersPanel = document.getElementById('admin-orders');
  const accessMessage = document.getElementById('admin-access-message');
  const signoutButton = document.getElementById('admin-signout');
  if (!ordersPanel || !accessMessage) return;

  const sellerDashboard = document.body.dataset.dashboardRole === 'seller';
  if (!currentAccount) {
    window.location.replace(`${sellerDashboard ? 'seller' : 'admin'}-login.html`);
    return;
  }
  if (sellerDashboard && (currentAccount.isAdmin || !currentAccount.isSeller)) {
    window.location.replace(currentAccount.isAdmin ? 'admin.html' : 'seller-login.html');
    return;
  }
  if (!sellerDashboard && !currentAccount.isAdmin) {
    window.location.replace(currentAccount.isSeller ? 'seller.html' : 'admin-login.html');
    return;
  }
  const ordersTab = document.querySelector('[data-admin-tab="orders"]');
  const usersTab = document.querySelector('[data-admin-tab="users"]');
  if (!currentAccount.isAdmin && !sellerDashboard && ordersTab) ordersTab.hidden = true;
  if (!currentAccount.isAdmin && usersTab) usersTab.hidden = true;
  ordersPanel.hidden = true;
  const usersPanel = document.getElementById('admin-users');
  if (usersPanel) usersPanel.hidden = true;

  usersPanel?.addEventListener('click', (event) => {
    if (event.target.closest('[data-admin-users-retry], [data-admin-users-refresh]')) loadAdminUsers();
  });

  signoutButton?.addEventListener('click', async () => {
    signoutButton.disabled = true;
    try {
      await signOutCurrentAccount();
      currentAccount = null;
      window.location.href = 'index.html';
    } catch (error) {
      accessMessage.textContent = error.message;
      accessMessage.hidden = false;
      signoutButton.disabled = false;
    }
  });

  initializeAdminProducts();
  if (currentAccount.isAdmin || sellerDashboard) await renderAdminOrders(ordersPanel, sellerDashboard);
  ordersPanel.addEventListener('click', async (event) => {
    const retryButton = event.target.closest('button[data-admin-action="retry"]');
    if (retryButton) await renderAdminOrders(ordersPanel, sellerDashboard);
  });
  ordersPanel.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-admin-order-id]');
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const statusSelect = form.elements.status;
    const selectedStatus = statusSelect.value;
    submitButton.disabled = true;
    try {
      await apiRequest(`/api/admin/orders/${encodeURIComponent(form.dataset.adminOrderId)}/status`, {
        method: 'PUT',
        body: { status: selectedStatus },
      });
      await renderAdminOrders(ordersPanel);
    } catch (error) {
      form.insertAdjacentHTML('beforeend', `<p class="account-inline-error" role="alert">${escapeHtml(error.message)}</p>`);
      submitButton.disabled = false;
    }
  });
}

async function renderAccountAddresses(container) {
  if (!container) return [];
  container.innerHTML = '<div class="account-state account-state-loading" role="status">Loading your addresses...</div>';

  try {
    const response = await apiRequest('/api/addresses');
    const addresses = response.addresses;
    if (!addresses.length) {
      container.innerHTML = '<div class="account-orders-empty" role="status"><h2>No saved addresses</h2><p>Add an address for faster checkout.</p></div>';
      return addresses;
    }

    container.innerHTML = addresses.map((address) => `
      <article class="account-address-card" data-address-id="${escapeHtml(address.id)}">
        <header>
          <strong>${escapeHtml(address.label)}</strong>
          ${address.isDefault ? '<span class="account-order-status">Default</span>' : ''}
        </header>
        <p><strong>${escapeHtml(address.recipient)}</strong> · ${escapeHtml(address.phone)}</p>
        <p>${escapeHtml(address.street)}, ${escapeHtml(address.city)} ${escapeHtml(address.postalCode)}, ${escapeHtml(address.country)}</p>
        <div class="account-address-actions">
          <button type="button" data-address-action="edit">Edit</button>
          ${address.isDefault ? '' : '<button type="button" data-address-action="default">Set as default</button>'}
          <button type="button" data-address-action="delete">Remove</button>
        </div>
      </article>
    `).join('');
    return addresses;
  } catch (error) {
    container.innerHTML = `
      <div class="account-state account-state-error" role="alert">
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-address-action="retry">Try again</button>
      </div>
    `;
    return [];
  }
}

async function initializeAccountPage() {
  const accountForm = document.getElementById('account-profile-form');
  if (!accountForm) return;

  let existing = getDemoAccount();
  if (!existing) {
    window.location.replace('index.html?signin=1');
    return;
  }

  const accountUserName = document.getElementById('account-user-name');
  const accountSidebarAvatar = document.getElementById('account-avatar-sidebar');
  const accountMainAvatar = document.getElementById('account-main-avatar');
  const signoutButton = document.getElementById('account-signout');
  const purchasesPanel = document.getElementById('account-purchases');
  const addressesPanel = document.getElementById('account-addresses');
  const passwordPanel = document.getElementById('account-password');
  const staticPanel = document.getElementById('account-static-view');
  const addressList = document.getElementById('account-address-list');
  const addressForm = document.getElementById('account-address-form');
  const addressStatus = document.getElementById('account-address-status');
  const passwordForm = document.getElementById('account-password-form');
  const passwordStatus = document.getElementById('account-password-status');
  const pageTitle = document.getElementById('account-page-title');
  const pageSubtitle = document.getElementById('account-page-subtitle');
  const imageInput = document.getElementById('account-image-input');
  const imageSelectButton = document.getElementById('account-image-select');
  const status = document.getElementById('account-profile-status');
  let avatarImage = existing.avatarImage || '';

  if (accountAuthMode === 'firebase' && status) {
    status.textContent = 'You are signed in with Firebase Authentication. Profile edits, addresses, password changes, and orders still need the Northgate Python API.';
  }

  signoutButton?.addEventListener('click', async () => {
    signoutButton.disabled = true;
    try {
      await signOutCurrentAccount();
      currentAccount = null;
      window.location.href = 'index.html';
    } catch (error) {
      signoutButton.disabled = false;
      status.textContent = error.message;
    }
  });

  if (accountUserName) {
    accountUserName.textContent = existing.displayName || 'rgcanda';
  }
  const adminLink = document.getElementById('account-admin-link');
  if (adminLink) {
    adminLink.hidden = !existing.isAdmin && !existing.isSeller;
    adminLink.href = existing.isAdmin ? 'admin.html' : 'seller.html';
    adminLink.textContent = existing.isAdmin ? 'Admin dashboard' : 'Seller dashboard';
  }

  const staticViews = {
    'payment-methods': ['Banks & Cards', 'Payment details are not collected or stored in this demo.'],
    privacy: ['Privacy Settings', 'Your account profile and orders are stored in the local Northgate database. Passwords are hashed and never displayed.'],
    'notification-settings': ['Notification Settings', 'Email and push notifications are not configured in this local demo.'],
    'order-settings': ['Order Settings', 'Demo orders can be cancelled while their status is Processing.'],
    notifications: ['Notifications', 'You have no notifications.'],
    vouchers: ['My Vouchers', 'No vouchers are available in this demo.'],
    coins: ['My Northgate Coins', 'Northgate Coins are not enabled in this demo.'],
  };

  const setAccountView = async (view, activeButton = null) => {
    const showProfile = view === 'profile';
    const showPurchases = view === 'purchases';
    const showAddresses = view === 'addresses';
    const showPassword = view === 'password';
    const showStatic = Object.hasOwn(staticViews, view);
    accountForm.hidden = !showProfile;
    purchasesPanel.hidden = !showPurchases;
    addressesPanel.hidden = !showAddresses;
    passwordPanel.hidden = !showPassword;
    staticPanel.hidden = !showStatic;

    const titles = {
      profile: ['My Profile', 'Manage and protect your account'],
      purchases: ['My Purchases', 'Review your orders and items'],
      addresses: ['Addresses', 'Manage your saved delivery addresses'],
      password: ['Change Password', 'Keep your account credentials up to date'],
    };
    const copy = titles[view] || staticViews[view] || titles.profile;
    pageTitle.textContent = copy[0];
    pageSubtitle.textContent = copy[1];
    if (showStatic) {
      document.getElementById('account-static-title').textContent = copy[0];
      document.getElementById('account-static-message').textContent = copy[1];
    }

    document.querySelectorAll('[data-account-view]').forEach((button) => {
      button.classList.toggle('active', activeButton ? button === activeButton : button.dataset.accountView === 'profile' && view === 'profile');
    });
    if (showPurchases) await renderAccountPurchases(purchasesPanel);
    if (showAddresses) await renderAccountAddresses(addressList);
  };

  document.querySelectorAll('[data-account-view]').forEach((button) => {
    button.addEventListener('click', () => {
      setAccountView(button.dataset.accountView, button).catch(() => {});
    });
  });

  purchasesPanel.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-order-action], button[data-account-action]');
    if (!button) return;
    if (button.dataset.accountAction === 'retry-orders') {
      await renderAccountPurchases(purchasesPanel);
      return;
    }

    const card = button.closest('.account-order-card');
    if (button.dataset.orderAction === 'write-review') {
      const reviewContainer = button.closest('.account-product-review');
      const form = reviewContainer?.querySelector('.account-review-form');
      if (form) {
        form.hidden = !form.hidden;
        button.setAttribute('aria-expanded', String(!form.hidden));
        if (!form.hidden) form.querySelector('select[name="rating"]')?.focus();
      }
      return;
    }

    const confirmation = card?.querySelector('.account-order-cancel-confirm');
    if (button.dataset.orderAction === 'start-cancel') {
      confirmation.hidden = false;
      button.hidden = true;
      return;
    }
    if (button.dataset.orderAction === 'keep-order') {
      confirmation.hidden = true;
      card.querySelector('[data-order-action="start-cancel"]')?.removeAttribute('hidden');
      return;
    }
    if (button.dataset.orderAction === 'confirm-cancel') {
      button.disabled = true;
      try {
        await apiRequest(`/api/orders/${encodeURIComponent(button.dataset.orderId)}`, { method: 'DELETE' });
        await renderAccountPurchases(purchasesPanel);
      } catch (error) {
        confirmation.insertAdjacentHTML('beforeend', `<p class="account-inline-error" role="alert">${escapeHtml(error.message)}</p>`);
        button.disabled = false;
      }
    }
  });
  purchasesPanel.addEventListener('submit', async (event) => {
    const form = event.target.closest('form.account-review-form');
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.account-review-status');
    submitButton.disabled = true;
    status.textContent = 'Submitting your review...';
    try {
      await apiRequest('/api/product-reviews', {
        method: 'POST',
        body: {
          orderId: form.dataset.reviewOrder,
          productId: form.dataset.reviewProduct,
          rating: form.elements.rating.value,
          comment: form.elements.comment.value.trim(),
        },
      });
      await renderAccountPurchases(purchasesPanel);
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Your product review was saved.';
        toast.classList.add('show');
        clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
      }
    } catch (error) {
      status.textContent = error.message;
      submitButton.disabled = false;
    }
  });

  addressList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-address-action]');
    if (!button) return;
    const card = button.closest('.account-address-card');
    const addressId = card?.dataset.addressId;
    const action = button.dataset.addressAction;
    if (action === 'retry') {
      await renderAccountAddresses(addressList);
      return;
    }
    try {
      if (action === 'delete') {
        if (!window.confirm('Remove this saved address?')) return;
        await apiRequest(`/api/addresses/${encodeURIComponent(addressId)}`, { method: 'DELETE' });
      } else {
        const { addresses } = await apiRequest('/api/addresses');
        const address = addresses.find((item) => String(item.id) === addressId);
        if (!address) throw new Error('Address not found. Refresh and try again.');
        if (action === 'edit') {
          addressForm.elements.id.value = address.id;
          addressForm.elements.label.value = address.label;
          addressForm.elements.recipient.value = address.recipient;
          addressForm.elements.phone.value = address.phone;
          addressForm.elements.street.value = address.street;
          addressForm.elements.city.value = address.city;
          addressForm.elements.postalCode.value = address.postalCode;
          addressForm.elements.country.value = address.country;
          addressForm.elements.isDefault.checked = address.isDefault;
          document.getElementById('account-address-form-title').textContent = 'Edit address';
          addressStatus.textContent = '';
          addressForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (action === 'default') {
          await apiRequest('/api/addresses', { method: 'POST', body: { ...address, isDefault: true } });
          await renderAccountAddresses(addressList);
        }
      }
      if (action === 'delete') await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    }
  });

  const requestedView = new URLSearchParams(window.location.search).get('view') || 'profile';
  setAccountView(requestedView, document.querySelector(`[data-account-view="${CSS.escape(requestedView)}"]`)).catch(() => {});

  const fields = {
    username: document.getElementById('account-username'),
    name: document.getElementById('account-name'),
    email: document.getElementById('account-email'),
    phone: document.getElementById('account-phone'),
    gender: document.querySelectorAll('input[name="gender"]'),
    day: document.getElementById('account-day'),
    month: document.getElementById('account-month'),
    year: document.getElementById('account-year'),
  };

  fields.username.value = existing.username || existing.displayName || 'rgcanda';
  fields.name.value = existing.name || existing.displayName || 'rg';
  fields.email.value = existing.email || 'rgcanda777@gmail.com';
  fields.phone.value = existing.phone || '';
  fields.day.value = existing.dateOfBirth?.day || '';
  fields.month.value = existing.dateOfBirth?.month || '';
  fields.year.value = existing.dateOfBirth?.year || '';

  const setGender = (value) => {
    fields.gender.forEach((radio) => {
      radio.checked = radio.value === value;
    });
  };
  setGender(existing.gender || 'male');

  const renderAvatar = (imageSource, displayName) => {
    [accountSidebarAvatar, accountMainAvatar].forEach((avatar) => {
      if (!avatar) return;
      const image = avatar.querySelector('.account-avatar-image');
      const initial = avatar.querySelector('.account-avatar-initial');
      if (imageSource && image) {
        image.src = imageSource;
        image.hidden = false;
        if (initial) initial.hidden = true;
      } else {
        image?.removeAttribute('src');
        if (image) image.hidden = true;
        const initialText = (displayName || 'R').charAt(0).toUpperCase();
        if (initial) {
          initial.textContent = initialText;
          initial.hidden = false;
        } else {
          avatar.textContent = initialText;
        }
      }
    });
  };

  renderAvatar(existing.avatarImage, existing.username || existing.displayName);

  document.getElementById('account-email-edit')?.addEventListener('click', () => {
    fields.email.focus();
    fields.email.select();
  });

  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = addressForm.querySelector('button[type="submit"]');
    const formData = new FormData(addressForm);
    const address = {
      id: formData.get('id') || undefined,
      label: formData.get('label'),
      recipient: formData.get('recipient'),
      phone: formData.get('phone'),
      street: formData.get('street'),
      city: formData.get('city'),
      postalCode: formData.get('postalCode'),
      country: formData.get('country'),
      isDefault: addressForm.elements.isDefault.checked,
    };
    addressStatus.textContent = 'Saving address...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/addresses', { method: 'POST', body: address });
      addressForm.reset();
      addressForm.elements.id.value = '';
      addressForm.elements.label.value = 'Home';
      addressForm.elements.country.value = 'Philippines';
      addressForm.elements.isDefault.checked = true;
      document.getElementById('account-address-form-title').textContent = 'Add an address';
      addressStatus.textContent = 'Address saved.';
      await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = passwordForm.elements.newPassword.value;
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
      passwordStatus.textContent = 'The new passwords do not match.';
      passwordForm.elements.confirmPassword.focus();
      return;
    }

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    passwordStatus.textContent = 'Updating password...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/change-password', {
        method: 'PUT',
        body: {
          currentPassword: passwordForm.elements.currentPassword.value,
          newPassword,
        },
      });
      passwordForm.reset();
      passwordStatus.textContent = 'Password updated.';
    } catch (error) {
      passwordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  imageSelectButton?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      status.textContent = 'Choose a JPEG or PNG image.';
      imageInput.value = '';
      return;
    }

    if (file.size > 1024 * 1024) {
      status.textContent = 'The image must be 1 MB or smaller.';
      imageInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') return;
      existing.avatarImage = reader.result;
      renderAvatar(existing.avatarImage, fields.username.value.trim());
      status.textContent = 'Image selected. Save your profile to keep it.';
    });
    reader.addEventListener('error', () => {
      status.textContent = 'The image could not be opened. Choose another file.';
    });
    reader.readAsDataURL(file);
  });

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = fields.username.value.trim();
    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const day = fields.day.value;
    const month = fields.month.value;
    const year = fields.year.value;
    const hasPartialDate = Boolean(day || month || year);

    if (!username || !name || !email || !fields.email.validity.valid) {
      status.textContent = 'Enter a username, name, and valid email address.';
      return;
    }

    if (hasPartialDate && !(day && month && year)) {
      status.textContent = 'Choose the date, month, and year to complete your date of birth.';
      return;
    }

    if (hasPartialDate) {
      const monthNumber = fields.month.selectedIndex;
      const daysInMonth = new Date(Number(year), monthNumber, 0).getDate();
      if (Number(day) > daysInMonth) {
        status.textContent = 'That date of birth is not valid.';
        return;
      }
    }

    const formData = {
      username,
      name,
      email,
      phone: fields.phone.value || '',
      gender: document.querySelector('input[name="gender"]:checked')?.value || 'male',
      dateOfBirth: { day, month, year },
      avatarImage: existing.avatarImage || '',
    };

    const saveButton = accountForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    status.textContent = 'Saving profile...';
    try {
      const response = await apiRequest('/api/profile', { method: 'PUT', body: formData });
      existing = response.account;
      currentAccount = existing;
      avatarImage = existing.avatarImage;
      if (accountUserName) accountUserName.textContent = existing.username;
      renderAvatar(existing.avatarImage, existing.username);
      updateAccountHeader();
      status.textContent = 'Profile saved.';
      saveButton.textContent = 'Saved';
      setTimeout(() => { saveButton.textContent = 'Save'; }, 1200);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = addressForm.querySelector('button[type="submit"]');
    const formData = new FormData(addressForm);
    const address = Object.fromEntries(formData.entries());
    address.isDefault = addressForm.elements.isDefault.checked;
    addressStatus.textContent = 'Saving address...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/addresses', { method: 'POST', body: address });
      addressForm.reset();
      addressForm.elements.id.value = '';
      addressForm.elements.label.value = 'Home';
      addressForm.elements.country.value = 'Philippines';
      addressForm.elements.isDefault.checked = true;
      document.getElementById('account-address-form-title').textContent = 'Add an address';
      addressStatus.textContent = 'Address saved.';
      await renderAccountAddresses(addressList);
    } catch (error) {
      addressStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = passwordForm.elements.newPassword.value;
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
      passwordStatus.textContent = 'The new passwords do not match.';
      passwordForm.elements.confirmPassword.focus();
      return;
    }

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    passwordStatus.textContent = 'Updating password...';
    submitButton.disabled = true;
    try {
      await apiRequest('/api/change-password', {
        method: 'PUT',
        body: {
          currentPassword: passwordForm.elements.currentPassword.value,
          newPassword,
        },
      });
      passwordForm.reset();
      passwordStatus.textContent = 'Password updated.';
    } catch (error) {
      passwordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function getDeliveryLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELIVERY_LOCATION_KEY) || localStorage.getItem(LEGACY_DELIVERY_LOCATION_KEY) || 'null');
    if (saved && typeof saved.countryCode === 'string' && typeof saved.country === 'string') {
      return { ...saved, postalCode: typeof saved.postalCode === 'string' ? saved.postalCode : '' };
    }
  } catch (error) {
    return { countryCode: 'PH', country: 'Philippines', postalCode: '' };
  }
  return { countryCode: 'PH', country: 'Philippines', postalCode: '' };
}

function saveDeliveryLocation(location) {
  localStorage.setItem(DELIVERY_LOCATION_KEY, JSON.stringify(location));
  const label = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
  document.querySelectorAll('.delivery-location-label').forEach((element) => {
    element.textContent = label;
  });
}

function updateDeliveryLocationHeaders() {
  const location = getDeliveryLocation();
  const label = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
  document.querySelectorAll('.delivery-location-label').forEach((element) => {
    element.textContent = label;
  });
}

function populateDeliveryCountries(select) {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countries = DELIVERY_COUNTRY_CODES
    .map((code) => ({ code, name: displayNames.of(code) }))
    .filter((country) => country.name && country.name !== country.code)
    .sort((first, second) => first.name.localeCompare(second.name));

  select.replaceChildren(...countries.map(({ code, name }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    return option;
  }));
}

function getSupportResponse(question) {
  const message = question.toLowerCase();

  if (/order|track|tracking|purchase/.test(message)) {
    return { text: 'Demo orders are saved in this browser and appear under My Purchase in your account. They are not sent to a seller, and real delivery tracking is not available.' };
  }
  if (/return|refund|exchange/.test(message)) {
    return { text: 'Returns are only a demonstration here. Since demo checkout does not save purchases, there are no real items to return.' };
  }
  if (/deliver|delivery|shipping|ship|location|country|zip|postal/.test(message)) {
    const location = getDeliveryLocation();
    const destination = location.postalCode ? `${location.country} ${location.postalCode}` : location.country;
    return { text: `Your current demo delivery location is ${destination}. Use the Deliver to control in the header to change it.` };
  }
  if (/deal|discount|sale|today/.test(message)) {
    return {
      text: 'Browse the current demo offers in Today’s Deals. Prices and availability are examples.',
      link: { href: document.getElementById('todays-deals') ? '#todays-deals' : 'index.html#todays-deals', label: 'Browse today’s deals' },
    };
  }
  if (/new arrival|latest|new product/.test(message)) {
    return {
      text: 'Here are the latest demo products across several categories.',
      link: { href: document.getElementById('new-arrivals') ? '#new-arrivals' : 'index.html#new-arrivals', label: 'See new arrivals' },
    };
  }
  if (/cart|add to cart|account|sign in|login/.test(message)) {
    return { text: 'Adding items and checkout are demo flows. You can use the account button in the header to open the demo sign-in.' };
  }
  if (/checkout|payment|pay/.test(message)) {
    return { text: 'Checkout is for demonstration only. No order is placed and no payment is processed.' };
  }
  if (/contact|human|agent|person|help|support/.test(message)) {
    return { text: 'I’m the Northgate demo assistant. I can answer common questions here, but I’m not connected to a live support team.' };
  }
  return { text: 'I can help with demo orders, returns, delivery locations, checkout, today’s deals, and new arrivals. Which would you like to know about?' };
}

function initializeSupportAssistant() {
  document.body.insertAdjacentHTML('beforeend', `
    <button class="support-launcher" id="support-launcher" type="button" aria-expanded="false" aria-controls="support-panel">
      Ask support
    </button>
    <section class="support-panel" id="support-panel" aria-label="Northgate demo support" aria-hidden="true" hidden>
      <header class="support-header">
        <div>
          <strong>Northgate Support</strong>
          <span>DEMO ASSISTANT</span>
        </div>
        <button class="support-close" id="support-close" type="button" aria-label="Close support chat">×</button>
      </header>
      <div class="support-thread" id="support-thread" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="support-message support-message-agent">
          <p>Hi! I can help with demo orders, returns, delivery locations, checkout, and finding products.</p>
        </div>
        <div class="support-topics" aria-label="Common questions">
          <button type="button" data-support-question="Where is my order?">Track an order</button>
          <button type="button" data-support-question="How do returns work?">Returns</button>
          <button type="button" data-support-question="Change my delivery location">Delivery</button>
          <button type="button" data-support-question="Show me today’s deals">Today’s deals</button>
        </div>
      </div>
      <form class="support-form" id="support-form">
        <label class="visually-hidden" for="support-input">Ask Northgate support</label>
        <input id="support-input" name="question" type="text" autocomplete="off" placeholder="Ask a question" required />
        <button type="submit" aria-label="Send message">Send</button>
      </form>
      <p class="support-disclaimer">Demo replies only. No live agent or AI service is connected.</p>
    </section>
  `);

  const launcher = document.getElementById('support-launcher');
  const panel = document.getElementById('support-panel');
  const closeButton = document.getElementById('support-close');
  const thread = document.getElementById('support-thread');
  const form = document.getElementById('support-form');
  const input = document.getElementById('support-input');

  const closePanel = () => {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  };

  const addMessage = (text, role, link) => {
    const message = document.createElement('div');
    message.className = `support-message support-message-${role}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.append(paragraph);
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      message.append(anchor);
    }
    thread.append(message);
    thread.scrollTop = thread.scrollHeight;
  };

  const ask = (question) => {
    const value = question.trim();
    if (!value) return;
    addMessage(value, 'customer');
    const response = getSupportResponse(value);
    addMessage(response.text, 'agent', response.link);
  };

  const openPanel = (topic) => {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    if (topic) ask(topic);
    else input.focus();
  };

  launcher.addEventListener('click', () => openPanel());
  closeButton.addEventListener('click', closePanel);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
    form.reset();
    input.focus();
  });
  thread.querySelectorAll('[data-support-question]').forEach((button) => {
    button.addEventListener('click', () => ask(button.dataset.supportQuestion));
  });
  document.querySelectorAll('[data-support-open]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel(trigger.dataset.supportTopic || '');
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });
}

function addCartProduct(product, quantity = 1, variant = null) {
  const items = getCartItems();
  const productId = product.id || product.name;
  const variantId = variant?.id || '';
  const existing = items.find((item) => (
    String(item.id || item.name) === String(productId) && (item.variantId || '') === variantId
  ));
  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + Number(quantity || 1);
  } else {
    items.push({
      id: productId,
      name: product.name,
      price: Number(product.price || 0),
      image: normalizeImageSource(product.image || productImageUrl(product, 700)),
      quantity: Number(quantity || 1),
      variantId,
      variantLabel: variant ? [variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku : '',
    });
  }
  saveCartItems(items);
  updateCartCount();
  renderCartPage();

  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `${product.name} added to cart`;
    toast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  }
}

function renderCheckoutPreview() {
  const preview = document.getElementById('checkout-preview');
  if (!preview) return;

  const items = getCartItems();
  if (!items.length) {
    preview.innerHTML = '<p class="checkout-preview-empty">No items selected yet.</p>';
    return;
  }

  preview.innerHTML = items
    .map((item) => {
      const itemTotal = Number(item.quantity || 1) * Number(item.price || 0);
      const itemName = escapeHtml(item.name);
      return `
        <div class="checkout-preview-item">
          <img src="${escapeHtml(item.image || FALLBACK_IMAGE)}" alt="${itemName}" loading="lazy" />
          <div class="checkout-preview-copy">
            <strong>${itemName}</strong>
            <span>Qty ${item.quantity || 1}</span>
          </div>
          <span class="checkout-preview-price">$${itemTotal.toFixed(2)}</span>
        </div>
      `;
    })
    .join('');
}

function syncCheckoutSummary() {
  [
    ['summary-items', 'checkout-items'],
    ['summary-subtotal', 'checkout-subtotal'],
    ['summary-shipping', 'checkout-shipping'],
    ['summary-total', 'checkout-total'],
  ].forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (source && target) target.textContent = source.textContent;
  });

  renderCheckoutPreview();
}

function updateCheckoutAvailability(items) {
  const checkoutButton = document.getElementById('checkout-open');
  if (!checkoutButton) return;

  const hasItems = items.length > 0;
  checkoutButton.disabled = !hasItems;
  checkoutButton.setAttribute('aria-disabled', String(!hasItems));
  checkoutButton.title = hasItems ? 'Proceed to checkout' : 'Add an item to your cart to enable checkout';
}

function updateCartCount() {
  const items = getCartItems();
  const count = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  document.querySelectorAll('.cart-count').forEach((badge) => {
    badge.textContent = String(count);
  });
  return count;
}

function removeCartItem(index) {
  const items = getCartItems();
  const product = items[index];

  if (!product) return;

  showRemoveConfirmation(product.name, () => {
    items.splice(index, 1);
    saveCartItems(items);
    updateCartCount();
    renderCartPage();
  });
}

function showRemoveConfirmation(productName, onConfirm) {
  const backdrop = document.getElementById('confirm-modal');
  const message = document.getElementById('confirm-message');
  const confirmButton = document.getElementById('confirm-remove');
  const cancelButton = document.getElementById('cancel-remove');

  if (!backdrop || !message || !confirmButton || !cancelButton) {
    return;
  }

  message.textContent = `Are you sure you want to remove ${productName} from your cart?`;
  const returnFocusTo = document.activeElement;

  const closeModal = () => {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleEscape);
    returnFocusTo?.focus();
  };

  const handleEscape = (event) => {
    if (event.key === 'Escape') closeModal();
  };

  cancelButton.onclick = () => closeModal();
  confirmButton.onclick = () => {
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleEscape);
    onConfirm();
  };

  backdrop.onclick = (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  };

  backdrop.classList.add('show');
  backdrop.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', handleEscape);
  requestAnimationFrame(() => cancelButton.focus());
}

function renderCartPage() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  const items = getCartItems();
  updateCheckoutAvailability(items);
  if (!items.length) {
    container.innerHTML = `
      <div class="empty-cart">
        <h2>Your cart is empty</h2>
        <p>Browse the store and add a few favorites to get started.</p>
      </div>
    `;
    document.getElementById('cart-item-count').textContent = '0 items';
    document.getElementById('summary-items').textContent = '0';
    document.getElementById('summary-subtotal').textContent = '$0.00';
    document.getElementById('summary-shipping').textContent = '$0.00';
    document.getElementById('summary-total').textContent = '$0.00';
    syncCheckoutSummary();
    return;
  }

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const shipping = total > 0 ? 12.99 : 0;
  const finalTotal = total + shipping;

  container.innerHTML = items
    .map(
      (item, index) => `
        <article class="cart-item" data-index="${index}">
          <img src="${escapeHtml(item.image || FALLBACK_IMAGE)}" alt="${escapeHtml(item.name)}" />
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="cart-item-meta">
              ${item.variantLabel ? `<span>${escapeHtml(item.variantLabel)}</span>` : ''}
              <span>${item.variantId ? 'Stock checked at checkout' : 'In stock'}</span>
              <span>Free returns</span>
            </div>
            <div class="cart-item-actions">
              <div class="qty-control" aria-label="Quantity control">
                <button type="button" data-action="decrease" data-index="${index}">−</button>
                <span>${Number(item.quantity || 1)}</span>
                <button type="button" data-action="increase" data-index="${index}">+</button>
              </div>
            </div>
          </div>
          <div class="cart-item-price">$${(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}</div>
        </article>
      `
    )
    .join('');

  document.getElementById('cart-item-count').textContent = `${totalQuantity} item${totalQuantity !== 1 ? 's' : ''}`;
  document.getElementById('summary-items').textContent = String(totalQuantity);
  document.getElementById('summary-subtotal').textContent = `$${total.toFixed(2)}`;
  document.getElementById('summary-shipping').textContent = `$${shipping.toFixed(2)}`;
  document.getElementById('summary-total').textContent = `$${finalTotal.toFixed(2)}`;
  syncCheckoutSummary();

  container.querySelectorAll('[data-action="decrease"]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const current = getCartItems()[index];
      if (!current) return;

      if ((current.quantity || 1) <= 1) {
        removeCartItem(index);
        return;
      }

      const items = getCartItems();
      items[index].quantity = Number(items[index].quantity || 1) - 1;
      saveCartItems(items);
      updateCartCount();
      renderCartPage();
    });
  });

  container.querySelectorAll('[data-action="increase"]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const items = getCartItems();
      if (!items[index]) return;
      items[index].quantity = (Number(items[index].quantity || 1) + 1);
      saveCartItems(items);
      updateCartCount();
      renderCartPage();
    });
  });
}

function initializeRoleLoginPage() {
  const form = document.getElementById('role-login-form');
  const sellerRegisterForm = document.getElementById('seller-register-form');
  const sellerVerifyForm = document.getElementById('seller-verify-form');
  const status = document.getElementById('role-login-status');
  const role = document.body.dataset.loginRole;
  if ((!form && !sellerRegisterForm) || !status || !['admin', 'seller'].includes(role)) return;

  if (currentAccount?.isAdmin && role === 'admin') {
    window.location.replace('admin.html');
    return;
  }
  if (currentAccount?.isSeller && role === 'seller') {
    window.location.replace('seller.html');
    return;
  }

  if (sellerRegisterForm) {
    const submitButton = sellerRegisterForm.querySelector('button[type="submit"]');
    const password = sellerRegisterForm.elements.password;
    const confirmPassword = sellerRegisterForm.elements.confirmPassword;
    confirmPassword.addEventListener('input', () => {
      confirmPassword.setCustomValidity(
        confirmPassword.value === password.value ? '' : 'Passwords do not match.'
      );
    });
    password.addEventListener('input', () => {
      confirmPassword.setCustomValidity(
        confirmPassword.value === password.value ? '' : 'Passwords do not match.'
      );
    });
    sellerRegisterForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      submitButton.disabled = true;
      status.textContent = 'Creating your seller account...';
      try {
        const response = await apiRequest('/api/seller/register', {
          method: 'POST',
          body: {
            name: sellerRegisterForm.elements.name.value.trim(),
            email: sellerRegisterForm.elements.email.value.trim(),
            password: password.value,
          },
        });
        if (response.verificationRequired) {
          sellerRegisterForm.hidden = true;
          sellerVerifyForm.elements.email.value = response.email;
          sellerVerifyForm.hidden = false;
          status.textContent = `We sent a 6-digit verification code to ${response.email}. Enter it here to finish creating your seller account.`;
          sellerVerifyForm.elements.code.focus();
        }
      } catch (error) {
        if (error.payload?.verificationRequired && error.payload.email) {
          sellerRegisterForm.hidden = true;
          sellerVerifyForm.elements.email.value = error.payload.email;
          sellerVerifyForm.hidden = false;
          sellerVerifyForm.elements.code.focus();
        }
        status.textContent = error.message;
        if (!sellerVerifyForm.hidden) {
          status.textContent += ' Your account was saved; request a code again after the email service is configured.';
        } else {
          submitButton.disabled = false;
        }
      }
    });
    sellerVerifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const verifyButton = sellerVerifyForm.querySelector('button[type="submit"]');
      verifyButton.disabled = true;
      status.textContent = 'Verifying your email...';
      try {
        const response = await apiRequest('/api/verify-email', {
          method: 'POST',
          body: {
            email: sellerVerifyForm.elements.email.value.trim(),
            code: sellerVerifyForm.elements.code.value.trim(),
          },
        });
        currentAccount = response.account;
        window.location.replace('seller.html');
      } catch (error) {
        status.textContent = error.message;
        verifyButton.disabled = false;
      }
    });
    document.getElementById('seller-resend-code').addEventListener('click', async (event) => {
      const resendButton = event.currentTarget;
      resendButton.disabled = true;
      status.textContent = 'Sending another verification code...';
      try {
        await apiRequest('/api/verify-email/resend', {
          method: 'POST',
          body: { email: sellerVerifyForm.elements.email.value.trim() },
        });
        status.textContent = 'A new verification code has been sent to your email.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        resendButton.disabled = false;
      }
    });
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    status.textContent = 'Signing in...';
    try {
      const response = await apiRequest(`/api/${role}/login`, {
        method: 'POST',
        body: {
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
        },
      });
      currentAccount = response.account;
      window.location.replace(role === 'admin' ? 'admin.html' : 'seller.html');
    } catch (error) {
      status.textContent = error.message;
      submitButton.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await apiRequest('/api/session');
    currentAccount = session.account;
  } catch (error) {
    accountAuthMode = 'firebase';
    const hostedAuth = window.northgateFirebaseAuth;
    if (hostedAuth?.ready) {
      await hostedAuth.ready;
      currentAccount = firebaseAccount(hostedAuth.currentUser);
    } else {
      currentAccount = null;
    }
  }

  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  await loadStoreCatalog();
  updateCartCount();
  renderCartPage();
  renderCatalogProducts();
  renderHomepageCollections();
  renderProductDetail();
  filterCatalog();
  updateAccountHeader();
  updateDeliveryLocationHeaders();

  const locationModal = document.getElementById('location-modal');
  const locationTriggers = document.querySelectorAll('.location-trigger');
  const deliveryCountry = document.getElementById('delivery-country');
  const locationZip = document.getElementById('location-zip');
  const locationStatus = document.getElementById('location-status');

  if (locationModal && locationTriggers.length && deliveryCountry && locationZip && locationStatus) {
    populateDeliveryCountries(deliveryCountry);
    let locationReturnFocus = null;

    const closeLocationModal = () => {
      locationModal.classList.remove('show');
      locationModal.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', handleLocationEscape);
      locationReturnFocus?.focus();
    };

    const handleLocationEscape = (event) => {
      if (event.key === 'Escape' && locationModal.classList.contains('show')) closeLocationModal();
    };

    locationTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const saved = getDeliveryLocation();
        locationReturnFocus = trigger;
        deliveryCountry.value = saved.countryCode;
        locationZip.value = saved.postalCode;
        locationStatus.textContent = '';
        locationModal.classList.add('show');
        locationModal.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', handleLocationEscape);
        deliveryCountry.focus();
      });
    });

    const saveSelectedCountry = () => {
      const option = deliveryCountry.selectedOptions[0];
      if (!option) return;

      const postalCode = option.value === 'US' ? locationZip.value.trim() : '';
      if (postalCode && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
        locationStatus.textContent = 'Enter a valid 5-digit US ZIP code, or leave it blank.';
        locationZip.focus();
        return;
      }

      saveDeliveryLocation({ countryCode: option.value, country: option.textContent, postalCode });
      closeLocationModal();
    };

    document.getElementById('location-done').addEventListener('click', saveSelectedCountry);
    document.getElementById('location-apply').addEventListener('click', () => {
      const postalCode = locationZip.value.trim();
      if (!/^\d{5}(-\d{4})?$/.test(postalCode)) {
        locationStatus.textContent = 'Enter a valid 5-digit US ZIP code or ZIP+4.';
        locationZip.focus();
        return;
      }

      deliveryCountry.value = 'US';
      const unitedStates = deliveryCountry.selectedOptions[0];
      saveDeliveryLocation({ countryCode: 'US', country: unitedStates.textContent, postalCode });
      locationStatus.textContent = `Delivery location set to ${unitedStates.textContent} ${postalCode}.`;
    });
    locationModal.querySelector('.location-close').addEventListener('click', closeLocationModal);
    locationModal.addEventListener('click', (event) => {
      if (event.target === locationModal) closeLocationModal();
    });
    document.getElementById('location-signin').addEventListener('click', () => {
      closeLocationModal();
      document.querySelector('.account-trigger')?.click();
    });
  }

  let pendingCartAddition = null;
  const addToCartOrPrompt = (product, quantity = 1, variant = null) => {
    if (getDemoAccount()) {
      addCartProduct(product, quantity, variant);
      return;
    }

    pendingCartAddition = { product, quantity, variant };
    openLoginPopup('Sign in or create an account to add this item to your cart.');
  };

  const variantModal = document.getElementById('variant-modal');
  const variantModalTitle = document.getElementById('variant-modal-title');
  const variantModalSelect = document.getElementById('variant-modal-select');
  const variantModalStatus = document.getElementById('variant-modal-status');
  const variantModalAddButton = document.getElementById('variant-modal-add');
  let pendingVariantProduct = null;
  let variantModalTrigger = null;

  const closeVariantModal = () => {
    if (!variantModal) return;
    variantModal.classList.remove('show');
    variantModal.setAttribute('aria-hidden', 'true');
    pendingVariantProduct = null;
    variantModalTrigger?.focus();
  };

  const openVariantModal = (product, trigger) => {
    if (!variantModal || !variantModalTitle || !variantModalSelect || !variantModalStatus) return;
    pendingVariantProduct = product;
    variantModalTrigger = trigger;
    variantModalTitle.textContent = product.name;
    variantModalSelect.innerHTML = `
      <option value="">Select an option</option>
      ${product.variants.map((variant) => `
        <option value="${escapeHtml(variant.id)}" ${Number(variant.stock) < 1 ? 'disabled' : ''}>
          ${escapeHtml([variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku)}${Number(variant.stock) > 0 ? ` · ${Number(variant.stock)} in stock` : ' · Out of stock'}
        </option>
      `).join('')}
    `;
    variantModalStatus.textContent = '';
    variantModal.classList.add('show');
    variantModal.setAttribute('aria-hidden', 'false');
    variantModalSelect.focus();
  };

  if (variantModal && variantModalSelect && variantModalAddButton) {
    variantModal.querySelector('.variant-modal-close')?.addEventListener('click', closeVariantModal);
    variantModal.addEventListener('click', (event) => {
      if (event.target === variantModal) closeVariantModal();
    });
    variantModalSelect.addEventListener('change', () => {
      if (variantModalStatus) variantModalStatus.textContent = '';
    });
    variantModalAddButton.addEventListener('click', () => {
      const variant = pendingVariantProduct?.variants?.find((item) => item.id === variantModalSelect.value);
      if (!pendingVariantProduct || !variant) {
        if (variantModalStatus) variantModalStatus.textContent = 'Choose an available size or color before adding this item.';
        variantModalSelect.focus();
        return;
      }

      const product = pendingVariantProduct;
      closeVariantModal();
      addToCartOrPrompt(product, 1, variant);
    });
    variantModal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeVariantModal();
    });
  }

  const checkoutModal = document.getElementById('checkout-modal');
  const checkoutTrigger = document.getElementById('checkout-open');
  const checkoutForm = document.getElementById('checkout-form');

  if (checkoutModal && checkoutTrigger && checkoutForm) {
    const closeCheckout = () => {
      checkoutModal.classList.remove('show');
      checkoutModal.setAttribute('aria-hidden', 'true');
      renderCartPage();
      checkoutTrigger.focus();
    };

    checkoutTrigger.addEventListener('click', () => {
      if (!getDemoAccount()) {
        openLoginPopup('Sign in or create an account to continue to checkout.');
        return;
      }

      syncCheckoutSummary();
      checkoutModal.classList.add('show');
      checkoutModal.setAttribute('aria-hidden', 'false');
      document.getElementById('checkout-status').textContent = '';
      window.setTimeout(() => document.getElementById('checkout-name').focus(), 260);
    });

    checkoutModal.querySelector('.checkout-close').addEventListener('click', closeCheckout);
    checkoutModal.addEventListener('click', (event) => {
      if (event.target === checkoutModal) closeCheckout();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && checkoutModal.classList.contains('show')) closeCheckout();
    });

    checkoutForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('checkout-status');
      const items = getCartItems();
      if (!items.length) {
        status.textContent = 'Your cart is empty. Add an item before checking out.';
        return;
      }

      const formData = new FormData(checkoutForm);
      const submitButton = checkoutForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      status.textContent = 'Placing your demo order...';
      try {
        const response = await apiRequest('/api/orders', {
          method: 'POST',
          body: {
            customerName: String(formData.get('name') || '').trim(),
            deliveryEmail: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            address: {
              street: String(formData.get('address') || '').trim(),
              city: String(formData.get('city') || '').trim(),
              postalCode: String(formData.get('postal') || '').trim(),
            },
            paymentMethod: String(formData.get('payment') || ''),
            items: items.map((item) => ({
              id: item.id,
              quantity: item.quantity,
              ...(item.variantId ? { variantId: item.variantId } : {}),
            })),
          },
        });
        const order = response.order;
        saveCartItems([]);
        updateCartCount();
        document.getElementById('checkout-subtotal').textContent = `$${Number(order.subtotal).toFixed(2)}`;
        document.getElementById('checkout-shipping').textContent = `$${Number(order.shipping).toFixed(2)}`;
        document.getElementById('checkout-total').textContent = `$${Number(order.total).toFixed(2)}`;
        checkoutForm.hidden = true;
        document.querySelector('.checkout-intro').hidden = true;
        document.querySelector('.checkout-demo-note').hidden = true;
        document.getElementById('checkout-confirmation').hidden = false;
        document.getElementById('checkout-order-id').textContent = order.id;
        document.getElementById('checkout-summary-note').textContent = 'This saved order is managed in your Northgate account.';
        status.textContent = 'Order saved. No payment was processed.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const searchInput = document.querySelector('.search-bar input');
  const catalogSort = document.getElementById('catalog-sort');
  const isAccountPage = window.location.pathname.toLowerCase().endsWith('account.html');
  const isAdminPage = window.location.pathname.toLowerCase().endsWith('admin.html');
  const isSellerPage = window.location.pathname.toLowerCase().endsWith('seller.html');
  const isRoleLoginPage = Boolean(
    document.getElementById('role-login-form')
    || document.getElementById('seller-register-form')
  );

  if (isAccountPage) {
    if (!getDemoAccount()) {
      window.location.replace('index.html?signin=1');
      return;
    }
    await initializeAccountPage();
  } else if (isAdminPage || isSellerPage) {
    await initializeAdminPage();
  } else if (isRoleLoginPage) {
    initializeRoleLoginPage();
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      document.querySelectorAll('[data-category-filter]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === 'all'));
      });
      filterCatalog();
    });
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (catalogSort) {
    catalogSort.addEventListener('change', filterCatalog);
  }

  document.querySelectorAll('[data-category-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-category-filter]').forEach((filterButton) => {
        filterButton.setAttribute('aria-pressed', String(filterButton === button));
      });
      if (searchInput) searchInput.value = '';
      filterCatalog();
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const loginModal = document.getElementById('login-modal');
  const loginTrigger = document.querySelector('.account-trigger');
  const loginForm = document.getElementById('login-form');
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const authStatus = document.getElementById('auth-status');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authPasswordConfirm = document.getElementById('auth-password-confirm');
  const authPasswordFields = document.getElementById('auth-password-fields');
  const authOtpField = document.getElementById('auth-otp-field');
  const authOtp = document.getElementById('auth-otp');
  const authResendCode = document.getElementById('auth-resend-code');
  const authName = document.getElementById('auth-name');
  const authNameField = document.getElementById('auth-name-field');
  const authConfirmField = document.getElementById('auth-confirm-field');
  const authModeToggle = document.getElementById('auth-mode-toggle');
  const authTitle = document.getElementById('auth-title');
  const authSubmitText = authForm?.querySelector('.login-submit-text');
  let authReturnFocus = null;

  const openAccountPage = () => {
    window.location.href = 'account.html';
  };

  const setAuthMode = (registering) => {
    if (!authForm) return;
    authForm.dataset.mode = registering ? 'register' : 'signin';
    if (authNameField) authNameField.hidden = !registering;
    if (authName) authName.required = registering;
    if (authConfirmField) authConfirmField.hidden = !registering;
    if (authPasswordConfirm) {
      authPasswordConfirm.required = registering;
      authPasswordConfirm.value = '';
    }
    if (authPassword) {
      authPassword.required = true;
      authPassword.autocomplete = registering ? 'new-password' : 'current-password';
    }
    if (authPasswordFields) authPasswordFields.hidden = false;
    if (authOtpField) authOtpField.hidden = true;
    if (authOtp) {
      authOtp.required = false;
      authOtp.value = '';
    }
    if (authEmail) authEmail.readOnly = false;
    if (authTitle) authTitle.textContent = registering ? 'Create your account' : 'Sign in to Northgate';
    if (authSubmitText) authSubmitText.textContent = registering ? 'Create account' : 'Sign in';
    if (authModeToggle) {
      authModeToggle.textContent = registering ? 'I already have an account' : 'Create an account';
      authModeToggle.hidden = false;
    }
    if (authStatus) {
      authStatus.textContent = '';
      authStatus.classList.remove('success');
    }
  };

  const setVerificationMode = (email) => {
    if (!authForm || !authEmail || !authOtp || !authTitle || !authSubmitText) return;
    authForm.dataset.mode = 'verify';
    authEmail.value = email;
    authEmail.readOnly = true;
    if (authNameField) authNameField.hidden = true;
    if (authName) authName.required = false;
    if (authPasswordFields) authPasswordFields.hidden = true;
    if (authPassword) authPassword.required = false;
    if (authPasswordConfirm) authPasswordConfirm.required = false;
    if (authOtpField) authOtpField.hidden = false;
    authOtp.required = true;
    if (authModeToggle) authModeToggle.hidden = true;
    authTitle.textContent = 'Verify your email';
    authSubmitText.textContent = 'Verify email';
    authOtp.focus();
  };

  const openLoginPopup = (message = '') => {
    if (!authModal || !authForm) return;
    authReturnFocus = document.activeElement;
    authForm.reset();
    setAuthMode(false);
    authStatus.textContent = message;
    authModal.classList.add('show');
    authModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => authEmail.focus(), 100);
  };

  const closeLoginPopup = () => {
    if (!authModal) return;
    authModal.classList.remove('show');
    authModal.setAttribute('aria-hidden', 'true');
    authForm?.reset();
    if (authForm) setAuthMode(false);
    authStatus.textContent = '';
    pendingCartAddition = null;
    authReturnFocus?.focus();
  };

  document.querySelectorAll('.account-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (getDemoAccount()) openAccountPage();
      else openLoginPopup();
    });
  });

  document.querySelectorAll('.orders-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (getDemoAccount()) openAccountPage();
      else openLoginPopup('Sign in or create an account to view your orders.');
    });
  });

  if (authModal && authForm && authStatus) {
    setAuthMode(false);

    authModeToggle?.addEventListener('click', () => {
      setAuthMode(authForm.dataset.mode !== 'register');
    });

    authResendCode?.addEventListener('click', async () => {
      authResendCode.disabled = true;
      authStatus.textContent = 'Sending another verification code...';
      try {
        await apiRequest('/api/verify-email/resend', {
          method: 'POST',
          body: { email: authEmail.value.trim() },
        });
        authStatus.textContent = 'A new verification code has been sent to your email.';
      } catch (error) {
        if (error.payload?.verificationRequired && error.payload.email) {
          setVerificationMode(error.payload.email);
        }
        authStatus.textContent = error.message;
      } finally {
        authResendCode.disabled = false;
      }
    });

    document.getElementById('auth-close').addEventListener('click', closeLoginPopup);
    authModal.addEventListener('click', (event) => {
      if (event.target === authModal) closeLoginPopup();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && authModal.classList.contains('show')) closeLoginPopup();
    });

    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const verifying = authForm.dataset.mode === 'verify';
      const registering = authForm.dataset.mode === 'register';
      const email = authEmail.value.trim().toLowerCase();

      if (registering && authPassword.value !== authPasswordConfirm.value) {
        authStatus.textContent = 'Those passwords do not match.';
        authPasswordConfirm.focus();
        return;
      }

      const submitButton = authForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      authStatus.textContent = verifying
        ? 'Verifying your email...'
        : registering ? 'Creating your account...' : 'Signing in...';
      try {
        if (accountAuthMode === 'server') {
          const response = await apiRequest(
            verifying ? '/api/verify-email' : registering ? '/api/register' : '/api/login',
            {
            method: 'POST',
            body: {
              email,
              ...(verifying ? { code: authOtp.value.trim() } : { password: authPassword.value }),
              ...(registering ? { name: authName.value.trim() } : {}),
            },
            }
          );
          if (registering && response.verificationRequired) {
            setVerificationMode(response.email || email);
            authStatus.textContent = `We sent a 6-digit verification code to ${response.email || email}. Enter it here to finish creating your account.`;
            return;
          }
          currentAccount = response.account;
        } else {
          const hostedAuth = window.northgateFirebaseAuth;
          if (!hostedAuth) {
            throw new Error('Hosted sign-in could not load. Check your connection and refresh the page.');
          }
          if (!hostedAuth.isConfigured) {
            throw new Error('Firebase is not configured yet. Follow the free setup steps in DEPLOYING.md.');
          }
          if (registering) {
            const returnsToSite = await hostedAuth.createAccount(email, authPassword.value, authName.value.trim());
            setAuthMode(false);
            authPassword.value = '';
            authStatus.textContent = returnsToSite
              ? `We sent an email verification link to ${email}. Open it to verify your email, then sign in here.`
              : `We sent an email verification link to ${email}. Open it to verify your email, then return here and sign in.`;
            authStatus.classList.add('success');
            return;
          }
          const user = await hostedAuth.signIn(email, authPassword.value);
          currentAccount = firebaseAccount(user);
        }
        updateAccountHeader();
        authStatus.textContent = accountAuthMode === 'server'
          ? `Welcome, ${currentAccount.displayName}. Your account is saved on this local server.`
          : `Welcome, ${currentAccount.displayName}. You are signed in with Firebase Authentication.`;
        authStatus.classList.add('success');
        authPassword.value = '';
        authPasswordConfirm.value = '';

        if (pendingCartAddition) {
          addCartProduct(pendingCartAddition.product, pendingCartAddition.quantity, pendingCartAddition.variant);
          pendingCartAddition = null;
          authStatus.textContent += ' The item was added to your cart.';
        }
        window.setTimeout(closeLoginPopup, 1000);
      } catch (error) {
        if (registering && error.payload?.verificationRequired && error.payload.email) {
          setVerificationMode(error.payload.email);
          authStatus.textContent = `${error.message} Your account was saved; request a code again after the email service is configured.`;
          return;
        }
        authStatus.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  if (new URLSearchParams(window.location.search).get('signin') === '1' && !getDemoAccount()) {
    openLoginPopup('Sign in or create an account to continue.');
  }

  if (loginModal && loginTrigger) {
    const loginNameField = document.getElementById('login-name-field');
    const signInPasswordField = document.getElementById('login-signin-password-field');
    const signInPasswordInput = document.getElementById('login-signin-password');
    const passwordFields = document.getElementById('login-password-fields');
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const passwordConfirmInput = document.getElementById('login-password-confirm');
    const submitButton = loginForm.querySelector('.login-submit');
    const modeToggle = document.getElementById('login-mode-toggle');
    const signoutButton = document.getElementById('demo-signout');
    const status = document.getElementById('login-status');
    const ordersEmptyState = document.getElementById('orders-empty-state');
    const accountDetailsPanel = document.getElementById('account-details-panel');
    const loginTitle = document.getElementById('login-title');
    let signInPasswordStep = false;

    const updateSubmitButton = (text, icon = '→') => {
      submitButton.innerHTML = `
        <span class="login-submit-text">${text}</span>
        <span class="login-submit-icon" aria-hidden="true">${icon}</span>
      `;
    };

    const renderAccountDetails = () => {
      const account = getDemoAccount();
      if (!accountDetailsPanel || !account) {
        return;
      }

      const createdDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) : 'Recently';

      const recentOrders = [
        { id: '#NW-2048', item: 'Wireless Earbuds Pro', status: 'Shipped', total: '$79.99' },
        { id: '#NW-1941', item: 'Desk Air Purifier', status: 'Delivered', total: '$64.99' },
      ];

      accountDetailsPanel.innerHTML = `
        <div class="account-dashboard-shell">
          <aside class="account-sidebar">
            <div class="account-brand-row">
              <div class="account-brand-mark">${(account.displayName || 'R').charAt(0).toUpperCase()}</div>
              <div class="account-brand-copy">
                <span>${account.displayName}</span>
                <small>Edit Profile</small>
              </div>
            </div>

            <nav class="account-sidebar-nav" aria-label="Account navigation">
              <button type="button" class="account-nav-item active">
                <span class="account-icon" aria-hidden="true">◌</span>
                <span>My Account</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">👤</span>
                <span>Profile</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">💳</span>
                <span>Banks &amp; Cards</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">📍</span>
                <span>Addresses</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">🔒</span>
                <span>Change Password</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">⚙️</span>
                <span>Privacy Settings</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">🔔</span>
                <span>Notification Settings</span>
              </button>
              <button type="button" class="account-nav-item">
                <span class="account-icon" aria-hidden="true">⚙️</span>
                <span>Order Settings</span>
              </button>
            </nav>

            <div class="account-sidebar-section">
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🧾</span>
                <span>My Purchase</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🔔</span>
                <span>Notifications</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🎟️</span>
                <span>My Vouchers</span>
              </button>
              <button type="button" class="account-nav-item sub-item">
                <span class="account-icon" aria-hidden="true">🪙</span>
                <span>My Northgate Coins</span>
              </button>
            </div>
          </aside>

          <main class="account-main-panel">
            <div class="account-panel-row">
              <h2>Credit / Debit Card</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Add New Card
              </button>
            </div>

            <div class="account-empty-state">You don't have cards yet.</div>

            <div class="account-panel-row account-panel-row-spaced">
              <h2>Northgate Savings</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Link Northgate Account
              </button>
            </div>

            <div class="account-empty-state muted">You don't have a Northgate account yet</div>

            <div class="account-panel-row account-panel-row-spaced account-panel-row-last">
              <h2>My Bank Accounts</h2>
              <button type="button" class="account-primary-action">
                <span aria-hidden="true">＋</span>
                Add New Bank Account
              </button>
            </div>
          </main>
        </div>
      `;

      const editProfileButton = accountDetailsPanel.querySelector('.account-edit-profile');
      const manageAddressButton = accountDetailsPanel.querySelector('.account-manage-address');
      const viewOrdersButton = accountDetailsPanel.querySelector('.account-view-orders');

      editProfileButton?.addEventListener('click', () => {
        const account = getDemoAccount();
        const nextName = window.prompt('Update your profile name', account?.displayName || 'Member');
        if (nextName !== null) {
          saveDemoAccount(nextName.trim() || 'Member', account?.email || '', {
            phone: account?.phone || '+63 912 345 6789',
            address: account?.address || '22 Kapitan Tiago Street',
            city: account?.city || 'Quezon City',
            country: account?.country || 'Philippines',
          });
          renderAccountDetails();
        }
      });

      manageAddressButton?.addEventListener('click', () => {
        const account = getDemoAccount();
        const nextAddress = window.prompt('Update your shipping address', account?.address || '22 Kapitan Tiago Street');
        if (nextAddress !== null) {
          saveDemoAccount(account?.displayName || 'Member', account?.email || '', {
            phone: account?.phone || '+63 912 345 6789',
            address: nextAddress.trim() || account?.address || '22 Kapitan Tiago Street',
            city: account?.city || 'Quezon City',
            country: account?.country || 'Philippines',
          });
          renderAccountDetails();
        }
      });

      viewOrdersButton?.addEventListener('click', () => {
        setOrdersView(true);
      });
    };

    const setOrdersView = (enabled) => {
      loginTitle.textContent = enabled ? 'Returns & Orders' : 'Sign in or create account';
      loginForm.hidden = enabled;
      if (ordersEmptyState) ordersEmptyState.hidden = !enabled;
      loginModal.querySelector('.login-intro').hidden = enabled;
      loginModal.querySelector('.login-terms').hidden = enabled;
      loginModal.querySelector('.login-help').hidden = enabled;
      loginModal.querySelector('.login-business').hidden = enabled;
      loginModal.querySelector('.login-demo-note').hidden = enabled;

      if (accountDetailsPanel) {
        accountDetailsPanel.hidden = !enabled && !getDemoAccount();
      }
    };

    const setRegistrationMode = (enabled) => {
      loginForm.dataset.mode = enabled ? 'register' : 'signin';
      signInPasswordStep = false;
      signInPasswordField.hidden = true;
      signInPasswordInput.required = false;
      signInPasswordInput.value = '';
      loginNameField.hidden = !enabled;
      passwordFields.hidden = !enabled;
      nameInput.required = enabled;
      passwordInput.required = enabled;
      passwordConfirmInput.required = enabled;
      submitButton.disabled = false;
      updateSubmitButton(enabled ? 'Create account' : 'Continue');
      modeToggle.textContent = enabled ? 'I already have an account' : 'Create an account';
      status.textContent = '';
      status.classList.remove('success');
    };

    const closeLoginModal = () => {
      loginModal.classList.remove('show');
      loginModal.setAttribute('aria-hidden', 'true');
      setOrdersView(false);
      passwordInput.value = '';
      passwordConfirmInput.value = '';
      signInPasswordInput.value = '';
      loginTrigger.focus();
    };

    loginTrigger.addEventListener('click', () => {
      const account = getDemoAccount();
      setOrdersView(false);
      setRegistrationMode(false);
      signoutButton.hidden = !account;
      modeToggle.hidden = Boolean(account);
      submitButton.disabled = Boolean(account);
      updateSubmitButton(account ? 'Signed in' : 'Continue');
      if (account) {
        status.textContent = `Welcome back, ${account.displayName}.`;
        status.classList.add('success');
        renderAccountDetails();
        if (accountDetailsPanel) {
          accountDetailsPanel.hidden = false;
        }
        loginForm.hidden = true;
      } else {
        loginForm.hidden = false;
        if (accountDetailsPanel) accountDetailsPanel.hidden = true;
      }
      loginModal.classList.add('show');
      loginModal.setAttribute('aria-hidden', 'false');
      if (!account) document.getElementById('login-email').focus();
    });

    document.querySelectorAll('.orders-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const account = getDemoAccount();
        loginTrigger.click();
        if (account) {
          setOrdersView(true);
        } else {
          status.textContent = 'Sign in or create an account to view your orders and returns.';
        }
      });
    });

    modeToggle.addEventListener('click', () => {
      setRegistrationMode(loginForm.dataset.mode !== 'register');
      signoutButton.hidden = true;
      if (loginForm.dataset.mode === 'register') nameInput.focus();
      else document.getElementById('login-email').focus();
    });

    signoutButton.addEventListener('click', async () => {
      signoutButton.disabled = true;
      try {
        await signOutCurrentAccount();
        currentAccount = null;
        updateAccountHeader();
        signoutButton.hidden = true;
        modeToggle.hidden = false;
        setRegistrationMode(false);
        if (accountDetailsPanel) accountDetailsPanel.hidden = true;
        loginForm.hidden = false;
        status.textContent = 'You are signed out.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        signoutButton.disabled = false;
      }
    });

    loginModal.querySelector('.login-close').addEventListener('click', closeLoginModal);
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) closeLoginModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && loginModal.classList.contains('show')) {
        closeLoginModal();
      }
    });

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (loginForm.dataset.mode === 'register') {
        if (passwordInput.value !== passwordConfirmInput.value) {
          status.textContent = 'Those passwords do not match. Please check both fields.';
          passwordConfirmInput.focus();
          return;
        }

        const account = saveDemoAccount(nameInput.value, emailInput.value);
        status.textContent = `Demo account created. Welcome, ${account.displayName}. Your password was not saved or sent.`;
        status.classList.add('success');
        passwordInput.value = '';
        passwordConfirmInput.value = '';
        modeToggle.hidden = true;
        signoutButton.hidden = false;
        renderAccountDetails();
        if (accountDetailsPanel) {
          accountDetailsPanel.hidden = false;
          loginForm.hidden = true;
        }
        return;
      }

      if (!signInPasswordStep) {
        signInPasswordStep = true;
        signInPasswordField.hidden = false;
        signInPasswordInput.required = true;
        updateSubmitButton('Sign in');
        status.textContent = 'Enter your password to continue. Demo passwords are not verified or stored.';
        signInPasswordInput.focus();
        return;
      }

      const account = saveDemoAccount('Member', emailInput.value || '');
      status.textContent = `Demo sign-in complete. Welcome, ${account.displayName}. Your password was not verified, saved, or sent.`;
      status.classList.add('success');
      modeToggle.hidden = true;
      signoutButton.hidden = false;
      signInPasswordInput.value = '';
      signInPasswordInput.required = false;
      signInPasswordField.hidden = true;
      submitButton.disabled = true;
      updateSubmitButton('Signed in');
      renderAccountDetails();
      if (accountDetailsPanel) {
        accountDetailsPanel.hidden = false;
        loginForm.hidden = true;
      }
    });
  }

  document.querySelectorAll('.add-cart').forEach((button) => {
    const card = button.closest('.product-card');
    button.addEventListener('click', () => {
      const product = allProducts.find((item) => item.id === card?.dataset.productId);
      if (!product) {
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = 'This product is temporarily unavailable.';
          toast.classList.add('show');
          clearTimeout(window.toastTimer);
          window.toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
        }
        return;
      }
      if (product.variants?.length) {
        openVariantModal(product, button);
        return;
      }
      addToCartOrPrompt(product);
    });
  });

  const productAddButton = document.querySelector('.product-add-cart');
  if (productAddButton) {
    productAddButton.addEventListener('click', () => {
      const product = allProducts.find((item) => item.id === productAddButton.dataset.productId);
      const quantity = Number(document.getElementById('product-quantity').value) || 1;
      const variantSelect = document.getElementById('product-variant');
      const variant = product?.variants?.find((item) => item.id === variantSelect?.value);
      if (product?.variants?.length && !variant) {
        document.getElementById('product-variant-status').textContent = 'Choose an available size or color before adding this item.';
        variantSelect?.focus();
        return;
      }
      if (product) addToCartOrPrompt(product, quantity, variant);
    });
  }

  initializeSupportAssistant();
});
