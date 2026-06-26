# AI Design Studio (Interactive AI Creator Lab & PKL Specialist Suite)

Aplikasi berbasis web full-stack yang modern, cepat, dan cerdas dengan kombinasi **React / Vite** di frontend dan **Express + Gemini API** di backend. Dirancang sebagai asisten visual harian dengan fokus khusus pada mendukung **Lomba Kompetensi Siswa PKL Specialist** serta modernisasi pemasaran digital bagi produk UMKM/PKL (Pedagang Kaki Lima / Usaha Mikro Kecil Menengah) di Indonesia.

Satu foto produk mentah dari UMKM dapat diubah secara instan menjadi poster promosi estetik, mockup kaos, twibbon, kolase, pas foto formal rapi, atau dianalisis kognitif preferensi desainnya melalui asisten visual interaktif.

---

## 🚀 Fitur Utama & Keunggulan

### 1. **AI Poster Generator & All-in-One Mockup Creator**
*   **Poster Hub:** Mengubah satu unggahan foto acak menjadi poster promosi berkecepatan tinggi dengan berbagai template seperti *Aesthetic Cafe*, *Minimalist Showcase*, *Diskon Gila*, atau *Acara Modern*.
*   **Merchandise Mockup:** Memvisualisasikan gambar kreasi produk langsung pada draf Mockup Kaos, Mug Keramik, atau Banner Toko.
*   **Twibbon & Frame:** Menghias draf foto promosi dengan berbagai ornamen bingkai kampanye instan.
*   **Pas Foto Kantoran:** Deteksi dan pemisahan subjek foto untuk disematkan jas formal berlatar biru/merah guna melengkapi keperluan berkas administrasi PKL/Magang siswa.

### 2. **🏆 AI Creator Lab & Design DNA (Presentation-Grade)**
*   **AI Design Memory**: Mengingat preferensi estetika warna teratas pada draf desain sebelumnya demi kontinuitas visual di lembar kerja poster berikutnya secara dinamis.
*   **AI Business Mode Adjuster**: Mengganti fokus kategori sektor usaha PKL (seperti *Barbershop*, *Cafe Specialty*, *Boutique Fashion*, *Beauty Salon*, atau *Dynamic School*). AI secara proaktif menyajikan saran narasi slogan dan mengunggah skema kontras palet warna padanan.
*   **AI Design Remix**: Fitur sekali klik untuk memutasi estetika seluruh draf menggunakan resep instan berstandar seni tinggi (*Luxury Gold*, *Korean Pastel*, *Apple Stark*, *Cyberpunk Violet*, dsb).
*   **AI Seasonal Holiday Shifter**: Transformasi tema promo dagang UMKM secara temporal menyambut masa perayaan nasional seperti *Ramadhan*, *Imlek*, *Natal*, *Back to School*, dan *Hari Kemerdekaan*.
*   **Reverse Design Engineering AI**: Alat analisis forensik visual yang membongkar layout rancangan gambar rujukan pihak ketiga untuk menyaring paduan kode HEX warna dominan, rekomendasi Google Fonts yang selaras, serta wireframe posisi koordinat spasial elemennya.
*   **AI Design Coach**: Sistem mentor interaktif yang memberikan penilaian bintang (kontras, tipografi, white space, dan harmoni warna) disertai daftar pembenahan visual interaktif yang bisa dicentang satu per satu.
*   **Design DNA Wrapped Dashboard**: Rangkuman profil visual unik Anda dalam bentuk rekapitulasi data infografis estetis bergaya *Spotify Wrapped*, lengkap dengan pembagian persentase kategori rasa seni dan berbagai *achievement badges* berharga yang berhasil dibuka.
*   **Team Collaboration Board**: Kotak mading draf real-time untuk koordinasi dengan tim magang sekolah, dilengkapi kontrol status persetujuan draf (*Pending review*, *Under Peer review*, *Approved*), dan sistem mading pesan instan dengan tombol *upvote* interaktif.
*   **Weekly Challenge & Trend Predictor**: Mengikuti pengujian tema mingguan bergengsi dengan penilaian kuantitatif instan bersertifikasi juri AI, serta navigasi grafik tren kreatif bulanan yang akan datang (seperti *Warm Retro Nusantara*).

---

## 🛠️ Cara Penggunaan (How to Use)

### A. Memulai Aplikasi Secara Lokal
1. Lakukan instalasi semua dependensi dasar terlebih dahulu:
   ```bash
   npm install
   ```
2. Pastikan file `.env` telah disiapkan dan kunci API utama dimasukkan pada pendaftaran variabel lingkungan server.
3. Jalankan server pengembang terpadu:
   ```bash
   npm run dev
   ```
   *Aplikasi secara cerdas berjalan pada server lokal di http://localhost:3000.*

---

### B. Hub Kerja AI Creator Lab (Panduan Pintar)
1. **Pilih Sektor Bisnis**: Pada navigasi panel sisi kiri **AI Creator Lab**, pilih jenis industri UMKM mitra PKL Anda. Perhatikan bagaimana saran persona visual dan kombinasi palette memori diperbarui.
2. **Unggah Gambar Draf / Gunakan Sampel**: Di bagian draf, seret dan jatuhkan file gambar poster referensi Anda (JPG/PNG) atau klik cepat sampel rujukan estetis yang disediakan (*Cafe Story, Tech Banner, Skincare Glass*).
3. **Lakukan Forensik (Reverse AI)**: Masuk ke tab **Reverse AI**, klik "Dekonstruksi Layout". Juri kognitif server akan membaca dan merangkum paduan warna serta membongkar tata letak koordinat wireframe gambar tersebut.
4. **Minta Penilaian Coach**: Pindah ke tab **Design Coach**, klik "Mulai Kritik Detak". AI akan menilai karya Anda, menampilkan skor berskala bintang, dan memberikan daftar solusi pembenahan nyata demi mematangkan tampilan karya.
5. **Klaim Sertifikasi Juri**: Uji visual Anda di tab **Challenge**. Kirim pekerjaan draf Anda untuk diverifikasi secara langsung terhadap tema mingguan, terima kalkulasi skor orisinalitas, dan buka lencana medali legendaris untuk disematkan dalam laporan akhir portfolio DNA visual Anda.
6. **Diskusikan dengan Tim PKL**: Di bagian bawah collab board, ubah status persetujuan draf untuk pimpinan, tinggalkan umpan balik untuk rekan seperjuangan magang, serta ketuk tombol "👍 Upvote" pada ide yang cemerlang.

---

## 📂 Struktur Folder Proyek

*   `server.js`: Menangani perutean API full-stack Express, mengintegrasikan komunikasi terenkripsi langsung dengan Gemini API, mengelola interpretasi instruksi cerdas untuk dekonstruksi spasial, pengajaran desain, dan verifikasi juri tantangan secara asinkron.
*   `/index.html`: Kerangka struktur antarmuka satu layar yang dikemas fungsional dan responsif menggunakan utilitas kelas **Tailwind CSS v4** dan ikon representatif dari **Phosphate (Phosphor Icons)**.
*   `/src/main.js`: Logika interaktivitas dinamis DOM client-side, perekaman draf lokal melalui memori status, pengiriman data base64 asinkron, rendering grafik proporsi persentase DNA secara real-time, penanganan kontrol draf upload-zone, serta pengubahan tema temporal secara cepat.
*   `metadata.json`: Metadata platform AI Studio berisi konfigurasi izin media, deskripsi aplikasi, dan pendefinisian kapabilitas backend utama.

---

*Selamat berkreasi dengan **AI Design Studio**! Sukses selalu untuk Lomba PKL Specialist dan pertumbuhan pemasaran digital UMKM Indonesia!* 🚀🔥
