function showSkeletons(){
    const container = document.getElementById("product-details");
    
    container.innerHTML = `
        <div class="skeleton-card" role="status" aria-live="polite">
            <div>⏳ Memuat detail produk...</div>
        </div>
     `;    
}

function setupQuantityControls(stock, initQuantity){
    const input = document.getElementById("quantity-input");
    const incBtn = document.getElementById("inc-btn");
    const decBtn = document.getElementById("dec-btn");
    const addToCartBtn = document.getElementById("cart-btn");
    input.value = initQuantity || 0;
    const isOutOfStock = (stock === 0);
    if(isOutOfStock){
        input.disabled = true;
        incBtn.disabled = true;
        decBtn.disabled = true;
    }else{
        input.disabled = false;
        incBtn.disabled = false;
        decBtn.disabled = false;
    }
    if(addToCartBtn){
        addToCartBtn.disabled = isOutOfStock;
    }
    if (isOutOfStock && addToCartBtn){
        addToCartBtn.textContent = "Stok Habis";
    }
    function clamp(val){
        return Math.min(Math.max(val,0), stock);
    }
    function update(newVal){
        const clampedVal =clamp(newVal);
        input.value = clampedVal;
        input.setAttribute('aria-valuenow', clampedVal);      
        if (decBtn) decBtn.disabled = (clampedVal <= 0 || (stock===0));
        if (incBtn) incBtn.disabled = (clampedVal >= stock || (stock===0));
        if (addToCartBtn) {
            addToCartBtn.disabled = (clampedVal === 0 || stock === 0);
        }

    }

    incBtn.addEventListener("click", ()=>{
        const current = parseInt(input.value) || 0;
        update(current+1);
    });
    decBtn.addEventListener("click", ()=>{
        const current = parseInt(input.value) || 0;
        update(current-1);
    });
    input.addEventListener("input", ()=>{
        const val = parseInt(input.value);
        if (isNaN(val)) input.value=0;
        else update(val);
    });
    update(initQuantity || 0);
}

function updateNavbarCartCount(count) {
    const cartBadge = document.getElementById('cart-badge'); 
    if (cartBadge) {
        cartBadge.textContent = count;
        if (count > 0) {
            cartBadge.classList.add('show');
        } else {
            cartBadge.classList.remove('show');
        }
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get("store_id");
    const productId = params.get("product_id");

    // just in case validation on php didnt work
    if(!storeId||!productId){
        console.error("Store ID or Product ID missing");
        document.getElementById("product-details").innerHTML = '<h2>Parameter tidak valid.</h2>';
        window.location.href = "/discovery.php";
        return;
    }

    const container = document.getElementById("product-details");

    showSkeletons();
    const xhrLoad = new XMLHttpRequest();
    // console.log('store_id',storeId);
    // console.log('product_id', productId);
    const apiUrl = `/api/get_product_details.php?store_id=${storeId}&product_id=${productId}`;
    xhrLoad.open('GET', apiUrl, true);

    xhrLoad.onload = function() {
        if (xhrLoad.status >= 200 && xhrLoad.status < 300) {
            try {
                const data = JSON.parse(xhrLoad.responseText);

                // cek error
                if (data.error) {
                    container.innerHTML = `<h2>${data.error}</h2>`;
                    return;
                }

                const { session, product, categories, store, cart } = data;

                // Build categories HTML
                const categoriesHTML = categories && categories.length > 0 
                    ? categories.map(c => `<span class="category-tag">${c.name}</span>`).join('')
                    : '<span class="category-tag">Tidak ada kategori</span>';

                // Render HTML dengan struktur baru
                 container.innerHTML = `

                    <div class="product-grid">
                        <div class="image-section">
                            <img 
                                src="${product.main_image_path}" 
                                alt="${product.product_name || 'Product'}" 
                                class="product-image"
                                onerror="this.onerror=null; this.src='/public/uploads/ui/placeholder.png'"
                            >
                        </div>

                        <div class="product-info">
                            <h1>${product.product_name || 'Nama Produk'}</h1>
                            
                            <div class="store-name">
                                Terjual oleh 
                                <a href="/store_details.php?store_id=${store.store_id}">${store.store_name || 'Nama Toko'}</a>
                            </div>

                            <div class="price" aria-label="Harga produk">Rp${Number(product.price || 0).toLocaleString('id-ID')}</div>
                            
                            <div class="stock">
                                Stok: <span>${product.stock > 0 ? product.stock : 'Habis'}</span>
                            </div>

                            <div class="categories" role="list" aria-label="Kategori produk">
                                ${categoriesHTML}
                            </div>

                            <div class="description">${product.description || 'Tidak ada deskripsi'}</div>
                            
                            <div class="quantity-control" role="group" aria-label="Kontrol jumlah">
                                <button id="dec-btn" aria-label="Kurangi jumlah">−</button>
                                <input 
                                    id="quantity-input" 
                                    type="number" 
                                    value="${cart.quantity}" 
                                    min="0" 
                                    max="${product.stock || 0}" 
                                    readonly
                                    aria-label="Jumlah produk"
                                    aria-valuemin="0"
                                    aria-valuemax="${product.stock || 0}"
                                    aria-valuenow="${cart.quantity}"
                                >
                                <button id="inc-btn" aria-label="Tambah jumlah">+</button>
                            </div>
                     </div>
                 `;

                if (session === "BUYER") {
                    const productInfoDiv = container.querySelector('.product-info');
                    productInfoDiv.innerHTML += `
                            <div class="cart-actions">
                                <button id="cart-btn" class="btn-add-cart" data-product-id="${product.product_id}">
                                    Tambahkan ke Keranjang
                                </button>
                                <button id="redirect-to-cart-btn" class="btn-view-cart" onclick="window.location.href='/cart.php'">
                                    Lihat Keranjang
                                </button>
                            </div>
                        `;
                } else { // utk guest
                    const productInfoDiv = container.querySelector('.product-info');
                    productInfoDiv.innerHTML += `
                            <div class="login-prompt" role="alert">
                                <a href="/login.php">Masuk</a> atau <a href="/register.php">Daftar</a> untuk menambahkan ke keranjang
                            </div>
                        `;

                }
                
                // Add store info inside product-info div
                const productInfoDiv = container.querySelector('.product-info');
                productInfoDiv.innerHTML += `
                            <section class="store-info">
                                <h2>Tentang Toko</h2>
                                <p><a href="/store_details.php?store_id=${store.store_id}">${store.store_name || 'Nama Toko'}</a></p>
                                <p>${store.store_description || 'Tidak ada deskripsi toko'}</p>
                            </section>
                        </div>
                    </div>
                `;
 
                if (session === "BUYER") {
                    setupQuantityControls(product.stock, cart.quantity);
                }

                // --- LOGIKA ADD TO CART ---
                const cartBtn = document.getElementById("cart-btn");
                const quantityInput = document.getElementById("quantity-input");

                if (cartBtn && quantityInput) {
                    cartBtn.addEventListener("click", () => {
                        const quantity = parseInt(quantityInput.value) || 0;
                        const productIdFromButton = cartBtn.getAttribute('data-product-id');

                        cartBtn.disabled = true;
                        cartBtn.textContent = 'Memproses...';

                        const xhrUpdateCart = new XMLHttpRequest();
                        xhrUpdateCart.open("POST", "/api/update_cart_item.php", true);
                        xhrUpdateCart.setRequestHeader("Content-Type", "application/json");

                        xhrUpdateCart.onload = function() {
                            cartBtn.disabled = false; // Enable lagi
                            cartBtn.textContent = 'Tambahkan ke Keranjang';

                            if (xhrUpdateCart.status >= 200 && xhrUpdateCart.status < 300) {
                                try {
                                    const updateData = JSON.parse(xhrUpdateCart.responseText);
                                    if (updateData.success) {
                                        // alert(updateData.message); // alert sementara
                                        showToast(updateData.message);
                                        updateNavbarCartCount(updateData.cartCount); 
                                    } else {
                                        alert("Gagal: " + updateData.message);
                                    }
                                } catch(e) { alert("Format respons update keranjang tidak valid."); }
                            } else {
                                alert(`Error ${xhrUpdateCart.status}: Gagal memperbarui keranjang.`);
                            }
                        };

                        xhrUpdateCart.onerror = function() {
                             cartBtn.disabled = false;
                             cartBtn.textContent = 'Tambahkan ke Keranjang';
                             alert("Error jaringan saat memperbarui keranjang.");
                        };
                        
                        xhrUpdateCart.send(JSON.stringify({
                            product_id: productIdFromButton,
                            quantity: quantity
                        }));
                    });
                }

            } catch (e) {
                console.error("Error parsing product details JSON:", e);
                container.innerHTML = '<div class="skeleton-card"> Terjadi kesalahan saat memproses data produk</div>';
            }
        } else {
            console.error('Error loading product details:', xhrLoad.statusText);
            let errorMsg = `Gagal memuat produk (Status: ${xhrLoad.status}).`;
            try {
                const errData = JSON.parse(xhrLoad.responseText);
                errorMsg = errData.error || errorMsg;
            } catch(e){}
            container.innerHTML = `<div class="skeleton-card">${errorMsg}</div>`;
        }
    };

    xhrLoad.onerror = function() {
        console.error('Network Error loading product details');
        container.innerHTML = '<div class="skeleton-card">Tidak dapat terhubung ke server</div>';
    };

    xhrLoad.send();

});

// toast
function showToast(message, duration=3000){
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}