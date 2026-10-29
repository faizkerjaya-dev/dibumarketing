# Dibu Marketing — Content Management System

Sistem pengurusan content, staf, KOL/creator dan kempen untuk pasukan marketing Air Tangan Dibu.
Stack: **React (Vite) + Firebase (Auth + Firestore)**, deploy di **Vercel**. Antara muka dalam Bahasa Malaysia.

---

## 1. Setup Firebase (sekali sahaja)

1. Buka https://console.firebase.google.com dan cipta projek.
2. **Build › Authentication › Get started**, aktifkan **Email/Password**.
3. **Build › Firestore Database › Create database**, mod **Production**, lokasi `asia-southeast1`.
4. **Firestore › Rules**: tampal isi `firestore.rules`, klik **Publish**.
5. **Firestore › Indexes › Composite › Add index**:
   - Collection ID: `comments`
   - Field 1: `targetId` — Ascending
   - Field 2: `visibleUids` — Array contains
   - Query scope: Collection
6. **Project settings › Your apps › Web**: salin `firebaseConfig`.

Firebase Storage tidak diperlukan. Fail besar disimpan di Google Drive; sistem simpan link sahaja.

## 2. Konfigurasi Firebase dalam app

Nilai Firebase sudah dimasukkan dalam `src/firebase.js`. Jika anda tukar projek, ubah objek `DEFAULT_CONFIG` di fail itu, atau tetapkan environment variables berikut (env var mengatasi nilai dalam fail):

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

Config web Firebase memang dimuatkan dalam browser dan bukan rahsia. Keselamatan data dikawal oleh `firestore.rules`.

## 3. Cipta Admin pertama

1. **Authentication › Users › Add user**: masukkan email dan kata laluan. Salin **User UID**.
2. **Firestore › Start collection**: Collection ID `users` (huruf kecil, tiada ruang kosong di hadapan).
3. Document ID: tampal UID tadi. Tambah medan:

   | Field | Type | Value |
   |---|---|---|
   | `name` | string | Nama anda |
   | `email` | string | Email anda |
   | `roles` | array | satu item string: `admin` |
   | `active` | boolean | `true` |
   | `staffId` | string | (kosong) |

4. Log masuk, kemudian **Pasukan › Tambah staf** untuk tambah diri anda.
5. **Tetapan › Pengguna**, edit akaun anda, pautkan ke profil staf tadi.

Selepas ini semua pengguna lain dicipta dari dalam app: **Tetapan › Pengguna › Tambah pengguna**.

## 4. Deploy ke Vercel

1. Upload projek ke GitHub (jangan sertakan `node_modules` dan `dist`).
2. Vercel › **Add New › Project** › import repo. Framework: **Vite**.
3. Klik **Deploy**.
4. Salin domain Vercel, kemudian Firebase › **Authentication › Settings › Authorized domains › Add domain**.

## 5. Jalankan di komputer

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # semak kod boleh di-build seperti di Vercel
```

---

## 6. Cara sistem ini dibina untuk kerja laju

Masalah yang diselesaikan: 4 content sehari bermakna 120 content sebulan. Borang panjang tidak boleh pakai.

**Tambah terus dalam kalendar.** Klik mana-mana tarikh, taip tajuk, tekan Enter. Content tersimpan dan kotak kekal terbuka untuk content seterusnya pada hari yang sama. Platform dan pemilik mengikut nilai terakhir yang anda guna.

**Rancang sebulan.** Tetapkan kekerapan sekali sahaja, contohnya 3 TikTok + 2 Instagram setiap Isnin hingga Jumaat. Sistem tempah slot kosong untuk seluruh tempoh. Slot tanpa tajuk **tidak dikira** dalam dashboard dan laporan. Butang **Isi slot** membuka senarai untuk taip semua tajuk sekaligus.

**Bank idea.** Content tanpa tarikh terbit muncul di panel kanan kalendar. Seret ke tarikh untuk menjadualkannya. Content Creator juga boleh hantar idea dari skrin Hari ini.

**Brief penuh bila perlu.** Panel sisi ada dua mod. *Tambah cepat* untuk kuantiti; *Brief penuh* untuk masa, kategori, topik, hook, konsep dan menugaskan staf. Tiada medan dibuang, cuma tidak dipaksa pada setiap content. Butang **Simpan dan tambah lagi** membiarkan panel terbuka.

**Satu halaman untuk satu content.** Tiada tab. Brief, tugasan, link, senarai semak, semakan dan catatan dibuka bila diklik.

## 7. Status content boleh diubah sendiri

**Tetapan › Status.** Admin boleh tambah, namakan semula, susun semula dan buang status. Lajur dalam Papan kerja mengikut senarai ini.

Setiap status mesti dipetakan ke salah satu **enam peringkat tetap**: Idea, Produksi, Semakan, Sedia terbit, Terbit, Arkib.

Sebabnya: laporan, dashboard dan syarat aliran kerja merujuk peringkat tetap, bukan nama status. Tanpa pemetaan ini, setiap kali nama status ditukar, semua laporan lama jadi tidak sah.

Syarat terikat pada peringkat:

| Peringkat | Syarat sebelum content boleh masuk |
|---|---|
| Sedia terbit | Tarikh terbit |
| Terbit | Link post dan tarikh sebenar terbit |
| Semakan, Sedia terbit, Terbit | Pemilik content |

Status yang sedang digunakan oleh content tidak boleh dibuang. Mesti ada sekurang-kurangnya satu status peringkat Terbit dan satu peringkat Arkib.

## 8. Role dan akses

| Role | Boleh buat |
|---|---|
| Admin | Semua, termasuk Tetapan dan Pengguna |
| Marketing Manager | Kempen, staf, creator, content, semakan FYP, laporan |
| Content Manager | Cipta dan edit content, beri tugasan. Tidak boleh set keputusan FYP |
| Creator Manager | Creator, tugasan kempen, deliverable, bayaran |
| Content Creator | Hari ini dan Kalendar saya sahaja: tugasan sendiri, senarai semak, tampal link draf, nota, balas komen semakan, hantar idea |
| Pemerhati | Baca sahaja |

- Seorang pengguna boleh ada lebih dari satu role; kebenaran digabungkan.
- Akses dikuatkuasakan oleh `firestore.rules` di server, bukan sekadar sorok butang.
- Content Creator **mesti dipautkan ke profil staf**, jika tidak tugasannya tidak kelihatan.
- Semua staf aktif boleh cipta content **tanpa tarikh terbit** (idea). Idea tidak boleh terbit sehingga seseorang yang berhak memberinya tarikh.

## 9. Troubleshooting

Mula di **Tetapan › Semakan sistem**: status setiap koleksi data, ujian kebenaran ikut role, **Salin diagnostik**, dan suis **log debug** (atau tambah `?debug=1` pada URL).

| Simptom | Punca biasa | Cara betulkan |
|---|---|---|
| "Setup belum lengkap" | Config Firebase kosong | Semak `src/firebase.js` atau env var di Vercel, kemudian Redeploy |
| "Akaun belum disediakan" | Dokumen `users/{uid}` tiada | Ikut bahagian 3. Pastikan nama collection `users` tiada ruang kosong di hadapan |
| "Tidak dapat sambung ke database" | Ad blocker atau extension menyekat Firestore | Cuba tetingkap Incognito, matikan extension untuk laman ini |
| "Akses ditolak" (`permission-denied`) | Role tak cukup, atau rules belum Publish | Semak role di Tetapan › Pengguna, tampal semula `firestore.rules` |
| "Firestore perlukan index" | Index composite tiada | Klik link dalam mesej, tunggu 1 hingga 5 minit, refresh |
| Creator tak nampak tugasan | Akaun tak dipautkan ke staf | Tetapan › Pengguna › Edit › Pautan profil staf |
| Log masuk gagal di Vercel | Domain belum dibenarkan | Firebase Auth › Settings › Authorized domains |

### Di mana nak ubah apa

| Perkara | Fail |
|---|---|
| Warna tema | `src/styles.css`, bahagian `:root` di atas sekali |
| Peringkat tetap dan status asal | `src/lib/statuses.js` |
| Senarai lain yang tetap (keutamaan, role tugasan, status creator) | `src/lib/constants.js` |
| Platform, kategori, produk, senarai semak, label slot | Dalam app: **Tetapan › Umum** |
| Status content | Dalam app: **Tetapan › Status** |
| Semua tulisan ke database | `src/lib/db.js` |
| Kebenaran UI | `src/lib/permissions.js` (mesti selari dengan `firestore.rules`) |
| Kiraan beban kerja | `src/lib/workload.js` |
| Syarat tukar status | `src/lib/workflow.js` |
| Mesej ralat | `src/lib/errors.js` |

## 10. Struktur data Firestore

| Koleksi | Isi |
|---|---|
| `users/{uid}` | `name`, `roles[]`, `staffId`, `active` |
| `staff` | Staf dalaman: kapasiti, kemahiran, tarikh tidak available, `userUid` |
| `content` | Content dan slot: brief, status, tarikh, `links[]`, `checklist{}`, `review{}`, `assigneeUids[]`, `isSlot`, `slotLabel` |
| `tasks` | Tugasan staf: content, jenis tugas, deadline, anggaran jam, status, sejarah |
| `campaigns` | Kempen: bajet, `team[]`, `expenses[]` |
| `creators` | KOL, influencer, UGC, affiliate: `tags[]`, `socials[]`, kadar, kontrak |
| `campaignCreators` | ID `campaignId__creatorId`, jadi creator tidak boleh berganda dalam satu kempen |
| `deliverables` | Deliverable creator: deadline, status, bilangan pembetulan |
| `metrics` | Rekod prestasi manual bagi content atau deliverable |
| `comments` | Thread: semakan FYP, pembetulan deliverable, catatan umum |
| `activity`, `notifications` | Log dan notifikasi dalam app |
| `settings/config` | Status content dan semua senarai boleh ubah |
| `counters` | Penjana kod: DBU, CMP, CR, DLV |

- Tarikh disimpan sebagai teks `YYYY-MM-DD`, jadi tiada isu zon masa.
- Slot ialah rekod `content` dengan `isSlot: true` dan tajuk kosong. Ia bertukar jadi content sebenar sebaik sahaja diberi tajuk.
- Rekod penting diarkib, bukan dipadam.

## 11. Had semasa

- **Upload fail ditangguhkan.** Staf tampal link Google Drive. Upload terus ke Drive boleh ditambah kemudian tanpa ubah struktur data.
- **Tiada peringatan deadline melalui email atau push.** Perlukan Cloud Functions dan pelan Blaze. Deadline dipaparkan di Dashboard dan Hari ini, dan notifikasi dalam app dihantar bila sesuatu berlaku.
- **Prestasi diisi manual.** Tiada sambungan API TikTok atau Instagram. Medan purata masa tonton dan peratus tonton penuh belum ada.
- **Padam akaun login** dibuat dalam Firebase Console. Dalam app, Admin hanya boleh nyahaktifkan akaun.
- **Rancang sebulan** dihadkan 400 slot setiap kali.

## 12. Perubahan v3.1 (kemas kini)

**Pembetulan bug**
- Panel Tambah/Edit content tidak lagi crash bila dibuka kali pertama.
- Content Creator kini boleh hantar idea (rules `counters` dibetulkan). **Tampal semula `firestore.rules` dan Publish.**
- "Content baharu" dari halaman kempen kini terus pilih kempen itu.
- Butang Edit pada bahagian Brief betul-betul buka editor.
- Content dengan status lama / status yang sudah dibuang tidak lagi hilang dari Papan kerja.
- Panel Brief menyemak syarat status (contoh: Terbit perlukan link post) sebelum simpan.
- Notifikasi tukar status diikat pada peringkat, bukan nama status.
- "Kembali ke asal" di Tetapan › Umum tidak lagi memadam status content.
- Padam content turut memadam tugasan berkaitan. Content arkib boleh dipulihkan.
- Semua operasi pukal (slot, notifikasi, nama kempen) dipecah ikut had 500 Firestore dan ditunggu sehingga selesai.

**Kemasan**
- Semua teks antara muka dalam Bahasa Malaysia, termasuk tarikh (contoh: Sel, 27 Okt).
- Butang Log keluar di sidebar kini kelihatan; sidebar kecil dipaparkan kemas.
- Dashboard, kalendar, halaman content dan kempen disusun semula supaya lebih kemas.
