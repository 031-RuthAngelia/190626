import "./index.css";


const TOOLS_DATA = [
    {
        category: "Marketing & Strategy Suite",
        items: [
            { id: "campaign", name: "AI Campaign & Marketing", icon: "ph-megaphone", color: "text-rose-600 bg-rose-100", reqImg: true, desc: "Ubah 1 foto produk jadi kampanye komplit (6 desain, script video, copy iklan, & kalender 30 hari)." },
            { id: "brandkit", name: "AI Brand Kit Generator", icon: "ph-palette", color: "text-rose-600 bg-rose-100", reqImg: false, desc: "Buat identitas visual otomatis (Logo, Warna HEX, Font)." },
            { id: "consistency", name: "Visual Consistency Checker", icon: "ph-shield-check", color: "text-rose-600 bg-rose-100", reqImg: true, desc: "Audit desain dengan target pasar (Warna, Font, Kontras)." }
        ]
    },
    {
        category: "Design Lab & Creator",
        items: [
            { id: "creatorlab", name: "AI Creator Lab & Design DNA", icon: "ph-dna", color: "text-purple-600 bg-purple-100", reqImg: true, desc: "Analisis kebiasaan desain, Reverse Engineering, & sesi Design Coach." },
            { id: "packaging", name: "AI Packaging Designer", icon: "ph-package", color: "text-purple-600 bg-purple-100", reqImg: true, desc: "Rancang kemasan produk UMKM (mockup visual 3D & spesifikasi bahan)." },
            { id: "booth", name: "AI Booth & Store Mockup", icon: "ph-storefront", color: "text-purple-600 bg-purple-100", reqImg: true, desc: "Simulasikan poster iklan Anda secara nyata di jalanan atau bazaar." },
            { id: "poster", name: "AI Poster Generator", icon: "ph-sparkles", color: "text-purple-600 bg-purple-100", reqImg: true, desc: "Generate poster dari foto mentah dengan AI." }
        ]
    },
    {
        category: "Photo Enhancement",
        items: [
            { id: "enhancer", name: "Product Photo Enhancer", icon: "ph-camera-plus", color: "text-cyan-600 bg-cyan-100", reqImg: true, desc: "Perbaiki foto produk layaknya di studio." },
            { id: "outfit", name: "AI Outfit Changer", icon: "ph-shirt-folded", color: "text-cyan-600 bg-cyan-100", reqImg: true, desc: "Ganti pakaian selfie/pas foto Anda." },
            { id: "resize", name: "Smart Resize Generator", icon: "ph-crop", color: "text-cyan-600 bg-cyan-100", reqImg: true, desc: "Ubah ukuran/rasio otomatis (Generative Fill)." }
        ]
    },
    {
        category: "Layout & Composition",
        items: [
            { id: "frame", name: "Frame AI", icon: "ph-frame-corners", color: "text-amber-600 bg-amber-100", reqImg: true, desc: "Pasang bingkai atau twibbon otomatis." },
            { id: "banner", name: "Banner AI", icon: "ph-monitor-play", color: "text-amber-600 bg-amber-100", reqImg: true, desc: "Rancang spanduk horizontal." },
            { id: "carousel", name: "Carousell AI", icon: "ph-layers", color: "text-amber-600 bg-amber-100", reqImg: true, desc: "Bentuk layout feed carousel." },
            { id: "kolase", name: "Kolase AI", icon: "ph-squares-four", color: "text-amber-600 bg-amber-100", reqImg: true, desc: "Susun foto kolase kreatif." }
        ]
    }
];

let activeTool = null;
let imageBase64 = null;

const PRESETS_DICTIONARY = {
    campaign: [
        "Tema Ramadhan & Mudik Lebaran",
        "Minimalis Modern Skandinavia",
        "Diskon Flash Sale Terbatas",
        "Elegan & Mewah Premium"
    ],
    brandkit: [
        "Startup Tech Minimalis Biru",
        "Kuliner Nusantara Tradisional",
        "Kecantikan & Estetika Pastel",
        "Kopi & Cafe Co-working Space"
    ],
    consistency: [
        "Uji Kontras & Keterbacaan Teks",
        "Audit Harmoni Palet Warna",
        "Analisis Kesesuaian Gen-Z",
        "Evaluasi Desain Minimalis"
    ],
    creatorlab: [
        "Reverse Engineering Teknik Cahaya",
        "Bedah Grid & Komposisi Aturan Ketiga",
        "Analisis Gaya Desain Poster Ini",
        "Rekomendasi Font & Tipografi"
    ],
    packaging: [
        "Botol Kaca Premium Minimalis",
        "Paper Box Ramah Lingkungan (Kraft)",
        "Pouch Matte Modern dengan Zipper",
        "Canister Tabung Silinder Elegan"
    ],
    booth: [
        "Booth Bazar Kayu Estetik Pop-up",
        "Stand Pameran Mall Futuristik",
        "Etalase Toko Ritel Kaca Mewah",
        "Spanduk Gantung Event Outdoor"
    ],
    poster: [
        "Poster Promosi Produk Studio",
        "Poster Event Musik Retro Vintage",
        "Flyer Promo Diskon Bold Modern",
        "Poster Film Drama Minimalis"
    ],
    enhancer: [
        "Pencahayaan Studio Softbox Lembut",
        "Gaya Neon Cyberpunk Dramatis",
        "Latar Belakang Marmer Putih Bersih",
        "Efek Bayangan Air & Cahaya Alam"
    ],
    outfit: [
        "Jas Kantor Profesional Hitam",
        "Kemeja Putih Polos Rapi",
        "Baju Batik Nusantara",
        "Jaket Denim Casual"
    ],
    resize: [
        "Ekspansi ke Rasio 16:9 Landscape",
        "Ekspansi ke Rasio 9:16 Story Vertikal",
        "Tambahkan Detail Meja Kayu & Tanaman",
        "Tambahkan Efek Blur Estetik di Pinggir"
    ],
    frame: [
        "Bingkai Polaroid Klasik Retro",
        "Twibbon Kemerdekaan Merah Putih",
        "Frame Emas Floral Undangan Mewah",
        "Garis Border Minimalis Neon Glow"
    ],
    banner: [
        "Banner Web Promosi Elektronik",
        "Header Shopee/Tokopedia Estetik",
        "Banner Iklan Facebook Kreatif",
        "Spanduk Event Outdoor Formal"
    ],
    carousel: [
        "Slide Edukatif Tips & Trik Bisnis",
        "Katalog Produk Fashion Minimalis",
        "Langkah Demi Langkah (Infografis)",
        "Kumpulan Testimoni Pelanggan Puas"
    ],
    kolase: [
        "Kolase Grid 3 Foto Simetris Bersih",
        "Susunan Acak Estetik Gaya Polaroid",
        "Kombinasi Split Layar Kiri & Kanan",
        "Kolase Studio Estetika Majalah Seni"
    ]
};

function renderPresets(toolId) {
    const container = getEl("presets-container");
    if (!container) return;
    
    container.innerHTML = "";
    const presets = PRESETS_DICTIONARY[toolId] || [];
    
    if (presets.length === 0) {
        container.classList.add("hidden");
        return;
    }
    
    container.classList.remove("hidden");
    
    presets.forEach((preset) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-btn w-full text-left font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-2xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/10 active:scale-[0.99] transition-all duration-150 shadow-sm text-sm";
        btn.textContent = preset;
        btn.setAttribute("data-preset-text", preset);
        
        btn.addEventListener("click", () => {
            // De-select other preset buttons
            document.querySelectorAll(".preset-btn").forEach(pBtn => {
                pBtn.className = "preset-btn w-full text-left font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-2xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/10 active:scale-[0.99] transition-all duration-150 shadow-sm text-sm";
            });
            
            // Highlight this one
            btn.className = "preset-btn w-full text-left font-semibold text-indigo-950 bg-indigo-50/30 border border-indigo-500 rounded-2xl p-4 cursor-pointer ring-2 ring-indigo-500/25 active:scale-[0.99] transition-all duration-150 shadow-sm text-sm";
            
            // Populate textarea
            const txt = getEl("custom-prompt");
            txt.value = preset;
            txt.focus();
        });
        
        container.appendChild(btn);
    });
}

// Helper to get element by ID
function getEl(id) {
    return document.getElementById(id);
}

let appInitialized = false;
function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    renderSidebar();
    renderDashboard();
    setupImageUploader();
    setupEventListeners();
    switchView('dashboard');
}

function renderSidebar() {
    const nav = getEl("sidebar-nav");
    let html = "";
    TOOLS_DATA.forEach(cat => {
        html += `<div class="mb-4"><p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2 font-mono">${cat.category}</p>`;
        cat.items.forEach(tool => {
            html += `
                <button data-tool-id="${tool.id}" class="w-full flex items-center gap-3 p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-indigo-700 transition font-medium text-sm text-left sidebar-tool-btn cursor-pointer">
                    <i class="ph-fill ${tool.icon} text-lg text-slate-400"></i> <span class="truncate">${tool.name}</span>
                </button>
            `;
        });
        html += `</div>`;
    });
    nav.innerHTML = html;

    // Attach click listeners to sidebar buttons
    document.querySelectorAll(".sidebar-tool-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const toolId = btn.getAttribute("data-tool-id");
            openTool(toolId);
        });
    });
}

function renderDashboard() {
    const grid = getEl("dashboard-grid");
    let html = "";
    TOOLS_DATA.forEach(cat => {
        html += `
            <div>
                <h2 class="text-xl font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">${cat.category}</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        `;
        cat.items.forEach(tool => {
            html += `
                <div data-tool-id="${tool.id}" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-400 transition cursor-pointer group flex flex-col h-full dashboard-tool-card">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center ${tool.color} mb-4 group-hover:scale-110 transition-transform">
                        <i class="ph-fill ${tool.icon} text-2xl"></i>
                    </div>
                    <h3 class="font-bold text-slate-800 text-base group-hover:text-indigo-700 transition leading-tight">${tool.name}</h3>
                    <p class="text-xs text-slate-500 mt-2 flex-1 leading-relaxed">${tool.desc}</p>
                </div>
            `;
        });
        html += `</div></div>`;
    });
    grid.innerHTML = html;

    // Attach click listeners to dashboard cards
    document.querySelectorAll(".dashboard-tool-card").forEach(card => {
        card.addEventListener("click", () => {
            const toolId = card.getAttribute("data-tool-id");
            openTool(toolId);
        });
    });
}

function switchView(viewId) {
    getEl("view-dashboard").classList.add("hidden-view");
    getEl("view-tool").classList.add("hidden-view");
    getEl(`view-${viewId}`).classList.remove("hidden-view");
    
    if(viewId === 'dashboard') {
        getEl("header-title").textContent = "Dashboard Utama";
        activeTool = null;
    }
}

function openTool(toolId) {
    for (const cat of TOOLS_DATA) {
        const found = cat.items.find(t => t.id === toolId);
        if (found) { activeTool = found; break; }
    }
    if(!activeTool) return;

    getEl("header-title").textContent = `Studio: ${activeTool.name}`;
    getEl("tool-title").textContent = activeTool.name;
    getEl("tool-desc").textContent = activeTool.reqImg ? "MEMBUTUHKAN REFERENSI GAMBAR" : "TEKS GENERATOR";
    
    const iconBox = getEl("tool-icon-box");
    iconBox.className = `p-3 rounded-xl text-2xl ${activeTool.color}`;
    getEl("tool-icon").className = `ph-fill ${activeTool.icon}`;

    const uploadSec = getEl("upload-section");
    if (!activeTool.reqImg) {
        uploadSec.classList.add("hidden");
    } else {
        uploadSec.classList.remove("hidden");
    }

    getEl("custom-prompt").value = "";
    renderPresets(toolId);
    clearImage();
    resetOutput();
    switchView('tool');
}

function setupImageUploader() {
    const input = getEl("file-input");
    const dropZone = getEl("drop-zone");

    dropZone.addEventListener("click", () => {
        input.click();
    });

    // Drag and drop support
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("border-indigo-400", "bg-indigo-50/50");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("border-indigo-400", "bg-indigo-50/50");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("border-indigo-400", "bg-indigo-50/50");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            processFile(file);
        }
    });

    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_SIZE = 800; // Compress for lighter base64 payload
            let w = img.width, h = img.height;
            if (w > h && w > MAX_SIZE) { h *= MAX_SIZE/w; w = MAX_SIZE; } 
            else if (h > MAX_SIZE) { w *= MAX_SIZE/h; h = MAX_SIZE; }
            
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            imageBase64 = dataUrl.split(',')[1];

            getEl("upload-empty").classList.add("hidden");
            const preview = getEl("upload-preview");
            preview.src = dataUrl;
            preview.classList.remove("hidden");
            getEl("btn-clear-img").classList.remove("hidden");
            getEl("drop-zone").classList.remove("border-dashed", "bg-slate-50");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function clearImage() {
    imageBase64 = null;
    getEl("file-input").value = "";
    getEl("upload-preview").classList.add("hidden");
    getEl("upload-preview").src = "";
    getEl("upload-empty").classList.remove("hidden");
    getEl("btn-clear-img").classList.add("hidden");
    getEl("drop-zone").classList.add("border-dashed", "bg-slate-50");
}

function generateSystemPrompt(toolId, userInput) {
    let prompt = "Bertindaklah sebagai Pakar Desain dan Marketing Profesional. ";
    const details = userInput ? `Detail/Instruksi khusus pengguna: "${userInput}". ` : "";

    switch (toolId) {
        case 'campaign':
            prompt += `Ubah foto produk/referensi yang saya lampirkan menjadi satu kampanye pemasaran digital lengkap. ${details} Berikan laporan menggunakan Markdown:\n## 1. Konsep 6 Format Visual Desain\n(Jelaskan ide untuk Feed IG, Story, Banner Web, Poster Print, Carousel, Thumbnail YouTube)\n## 2. Naskah Video Pendek Viral\n(Sertakan Hook, Body, dan CTA untuk TikTok/Reels)\n## 3. Copywriting Iklan Jitu\n(Headline, Body Text persuasif, 10 Hashtag)\n## 4. Strategi Postingan 30 Hari (Garis Besar)`;
            break;
        case 'brandkit':
            prompt += `Buat Brand Kit Generator lengkap berdasarkan deskripsi berikut: "${userInput}". Berikan output Markdown:\n## 1. Ide Nama Brand & Tagline\n## 2. Rekomendasi Palet Warna\n(Berikan Kode HEX murni dan makna psikologisnya)\n## 3. Tipografi\n(Font Headline & Body)\n## 4. Gaya Desain & Moodboard`;
            break;
        case 'consistency':
            prompt += `Verifikasi kecocokan citra desain/gambar lampiran dengan target pasar. ${details} Berikan output Markdown:\n## 1. Ekstraksi Identitas Visual\n(Bedah palet warna HEX murni yang ada di gambar)\n## 2. Ketebalan Tipografi & Kontras\n(Uji kontras keterbacaan)\n## 3. Laporan Audit Brand\n(Berikan kritik dan saran perbaikan instan)`;
            break;
        case 'creatorlab':
            prompt += `Analisis gambar ini. ${details} Berikan output Markdown:\n## 1. Reverse Engineering Desain\n(Bedah teknik komposisi, pencahayaan, hirarki visual)\n## 2. Design DNA Profile\n(Apa identitas/kebiasaan visual pengguna ini?)\n## 3. Design Coach\n(Berikan pembelajaran dan rekomendasi personal untuk meningkatkan skill desainnya)`;
            break;
        case 'packaging':
            prompt += `Rancang konsep kemasan produk UMKM profesional berdasarkan gambar/logo rujukan ini. ${details} (seperti stiker, label botol, kemasan makanan, hang tag). Berikan output Markdown:\n## 1. Konsep Visual Mockup 3D\n(Deskripsikan secara detail tampilan kemasannya)\n## 2. Spesifikasi Bahan Komprehensif\n(Rekomendasi material kertas/plastik/eco-friendly, jenis laminasi, dsb)\n## 3. Tata Letak Elemen`;
            break;
        case 'booth':
            prompt += `Simulasikan pemasangan poster/iklan ini secara nyata. ${details} (pilih media: booth bazar, etalase toko, stand pameran, spanduk jalan). Berikan output Markdown:\n## 1. Simulasi Foto Pemasangan Realistis\n(Deskripsikan secara visual bagaimana poster ini terlihat di lingkungan tersebut)\n## 2. Analisis Impact Lingkungan\n(Visibilitas dari jauh, pencahayaan sekitar)`;
            break;
        case 'outfit':
            prompt += `Tuliskan instruksi prompt visual (Generative Fill) yang sangat detail untuk fitur AI Outfit Changer agar mengganti pakaian orang di foto ini. ${details}`;
            break;
        case 'resize':
            prompt += `Jika saya menggunakan Smart Resize Generator untuk mengubah rasio gambar ini, area pinggir apa saja yang harus diisi oleh AI (Generative Expand)? Jelaskan detail elemen yang harus ditambahkan. ${details}`;
            break;
        default:
            prompt += `Analisis gambar/instruksi ini untuk kebutuhan fitur: ${toolId}. Berikan konsep dan ide brilian untuk mengeksekusinya. ${details}`;
            break;
    }
    return prompt;
}

// Convert data URI base64 to local memory Blob URL to avoid top-level data navigation 404/security blocks in modern browsers
function getSafeImageUrl(url) {
    if (!url) return "";
    if (url.startsWith("data:")) {
        try {
            const arr = url.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: mime });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error("Error converting data URL to blob:", e);
            return url;
        }
    }
    return url;
}

async function processAI() {
    if (activeTool.reqImg && !imageBase64) {
        alert("Mohon unggah foto / referensi desain terlebih dahulu di langkah 1.");
        return;
    }

    const userInput = getEl("custom-prompt").value.trim();
    const systemPrompt = generateSystemPrompt(activeTool.id, userInput);

    // Set UI Loading state
    const btnGen = getEl("btn-generate");
    btnGen.disabled = true;
    btnGen.classList.add("opacity-50");
    getEl("output-empty").classList.add("hidden-view");
    getEl("output-result").classList.add("hidden-view");
    getEl("output-loading").classList.remove("hidden-view");

    try {
        let textResponse = "";
        let imageUrl = "";

        // Always use Server-Side Proxy Call (automatically handles image generation, API configuration & analytics on the backend)
        const response = await fetch("/api/process-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemPrompt,
                imageBase64,
                toolId: activeTool.id,
                customPrompt: userInput
            })
        });

        if (!response.ok) {
            let errorMsg = "Terjadi kesalahan pada koneksi API Server.";
            try {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const err = await response.json();
                    errorMsg = err.error || errorMsg;
                } else {
                    const text = await response.text();
                    // Clean HTML tags if any to show a clean message, or truncate if too long
                    if (text.includes("<html") || text.includes("<body") || text.includes("<!doctype")) {
                        errorMsg = `Server Error (${response.status}): Server mengalami kendala teknis atau sedang restart. Silakan coba sesaat lagi.`;
                    } else {
                        errorMsg = text.substring(0, 300) || errorMsg;
                    }
                }
            } catch (e) {
                console.error("Error reading response:", e);
            }
            throw new Error(errorMsg);
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            throw new Error("Gagal membaca respon dari server (Bukan format JSON yang valid). Silakan coba lagi.");
        }
        textResponse = data.text;
        imageUrl = data.imageUrl;

        // Render generated image if available
        const imgWrapper = getEl("result-image-wrapper");
        const resultImg = getEl("result-image");
        const btnDownload = getEl("btn-download-img");
        const btnOpen = getEl("btn-open-img");

        if (imageUrl) {
            const safeUrl = getSafeImageUrl(imageUrl);
            resultImg.src = safeUrl;
            btnDownload.href = safeUrl;
            btnOpen.href = safeUrl;
            imgWrapper.classList.remove("hidden");
        } else {
            imgWrapper.classList.add("hidden");
            resultImg.src = "";
            btnDownload.href = "#";
            btnOpen.href = "#";
        }

        // Render Markdown text response if available
        if (textResponse && textResponse.trim()) {
            getEl("result-content").classList.remove("hidden");
            getEl("btn-copy").classList.remove("hidden");
            
            // Render Markdown using marked.js
            if (window.marked) {
                getEl("result-content").innerHTML = window.marked.parse(textResponse);
            } else {
                getEl("result-content").innerText = textResponse;
            }
        } else {
            getEl("result-content").classList.add("hidden");
            getEl("btn-copy").classList.add("hidden");
            getEl("result-content").innerHTML = "";
        }
        
        getEl("output-loading").classList.add("hidden-view");
        getEl("output-result").classList.remove("hidden-view");

    } catch (error) {
        console.error(error);
        alert(`Gagal memproses: ${error.message}\n\nHubungi administrator atau coba lagi dalam beberapa saat.`);
        resetOutput();
    } finally {
        btnGen.disabled = false;
        btnGen.classList.remove("opacity-50");
    }
}

function resetOutput() {
    getEl("output-empty").classList.remove("hidden-view");
    getEl("output-loading").classList.add("hidden-view");
    getEl("output-result").classList.add("hidden-view");
    getEl("result-content").innerHTML = "";

    const imgWrapper = getEl("result-image-wrapper");
    if (imgWrapper) {
        imgWrapper.classList.add("hidden");
    }
    const resultImg = getEl("result-image");
    if (resultImg) {
        resultImg.src = "";
    }
    getEl("result-content").classList.remove("hidden");
    getEl("btn-copy").classList.remove("hidden");
}

function copyResult() {
    const textContent = getEl("result-content").innerText;
    navigator.clipboard.writeText(textContent).then(() => {
        alert("Hasil rancangan AI berhasil disalin ke Clipboard!");
    }).catch(err => {
        console.error("Gagal menyalin:", err);
    });
}

function setupEventListeners() {
    // Logo Click
    getEl("logo-header").addEventListener("click", () => {
        switchView("dashboard");
    });

    // Generate action
    getEl("btn-generate").addEventListener("click", processAI);

    // Copy action
    getEl("btn-copy").addEventListener("click", copyResult);

    // Download action
    getEl("btn-download-img").addEventListener("click", async (e) => {
        const href = getEl("btn-download-img").getAttribute("href");
        if (!href || href === "#") return;
        
        e.preventDefault();
        try {
            const response = await fetch(href);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = "ai-design.jpg";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(href, "_blank");
        }
    });

    // Clear image
    getEl("btn-clear-img").addEventListener("click", clearImage);

    // Sync presets highlights when custom input is updated
    getEl("custom-prompt").addEventListener("input", () => {
        const val = getEl("custom-prompt").value;
        document.querySelectorAll(".preset-btn").forEach(btn => {
            if (btn.getAttribute("data-preset-text") !== val) {
                btn.className = "preset-btn w-full text-left font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-2xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/10 active:scale-[0.99] transition-all duration-150 shadow-sm text-sm";
            } else {
                btn.className = "preset-btn w-full text-left font-semibold text-indigo-950 bg-indigo-50/30 border border-indigo-500 rounded-2xl p-4 cursor-pointer ring-2 ring-indigo-500/25 active:scale-[0.99] transition-all duration-150 shadow-sm text-sm";
            }
        });
    });
}

// Run initializers
if (document.readyState === "complete" || document.readyState === "interactive") {
    initApp();
} else {
    document.addEventListener("DOMContentLoaded", initApp);
}
