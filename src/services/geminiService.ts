import { GoogleGenAI } from "@google/genai";

const getGemini = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Please configure it in the Secrets panel.");
  }
  return new GoogleGenAI({ apiKey });
};

export interface ArticleInput {
  b2: string; // Anchor Text
  r2: string; // Internal Link URL
  b3: string; // H1 / Main Keyword
  supportingKeywords: string[]; // B4 - B13
}

export const generateArticleSection = async (
  input: ArticleInput,
  sectionTitle: string,
  context: string,
  isIntro: boolean = false,
  isFAQ: boolean = false,
  isConclusion: boolean = false
) => {
  const ai = getGemini();

  const prompt = `
    Anda adalah seorang Senior Technical Writer dan Pakar SEO di industri konstruksi & infrastruktur.
    Tugas Anda adalah menulis satu bagian dari artikel pillar berjudul: "${input.b3}".

    KONTEKS UTAMA:
    - Target: Kontraktor, Konsultan, Vendor, Tim Pengadaan.
    - Gaya Bahasa: Profesional, Persuasif, Teknis-Populer, Lugas.
    - Bahasa: Indonesia.
    - Fokus: Topical Authority & EEAT.

    INSTRUKSI KHUSUS UNTUK BAGIAN INI:
    - Judul Bagian: ${sectionTitle}
    - Detail: ${context}
    ${isIntro ? "- Tulis pendahuluan mendalam tentang peran produk dalam konstruksi." : ""}
    ${isFAQ ? "- Buat FAQ maksimal 5 pertanyaan teknis yang relevan." : ""}
    ${isConclusion ? "- Buat kesimpulan persuasif dan tambahkan CTA (Call to Action)." : ""}

    KETENTUAN TEKNIS & STRUKTUR:
    - GUNAKAN STRUKTUR HIERARKI YANG KETAT: Gunakan H2 untuk subjudul utama dan H3 untuk rincian teknis di bawahnya.
    - ANTI-THIN CONTENT: Hindari paragraf pendek. Setiap bagian harus berisi penjelasan mendalam dan teknis.
    - Jika ini adalah pembahasan H2, buat 2-3 subjudul H3 yang membahas aspek teknis secara mendetail.
    - TARGET PANJANG: Bagian ini harus memiliki panjang berkisar **300-350 kata**. Pastikan total artikel (13 bagian) mencapai rentang **4.000 - 5.000 kata**.
    - Sertakan data spesifikasi, terminologi industri konstruksi yang akurat, dan narasi berbasis pengalaman lapangan (EEAT).
    - Gunakan alur problem-solution yang persuasif dan kredibel.
    - Gunakan format Markdown yang rapi (H2, H3, Bold untuk penekanan).

    ${sectionTitle === input.supportingKeywords[0] || sectionTitle === input.supportingKeywords[5] ? `
    INSTRUKSI INTERNAL LINK:
    - Sisipkan internal link pada paragraf pertama bagian ini secara natural.
    - Anchor text: [${input.b2}](${input.r2})
    ` : ""}

    ${isConclusion ? `
    KONTAK & CTA (Gunakan link berikut):
    - Konsultasi teknis proyek: [Konsultasi Teknis](https://primatex.co.id/konsultasi/)
    - Permintaan informasi harga: [Permintaan Harga](https://primatex.co.id/permintaan-harga/)
    - Kontak WhatsApp langsung: [WhatsApp](https://wa.me/message/WSI7AS6VJ3SBH1)
    ` : ""}

    Hasil tulisan harus kredibel, seolah ditulis oleh praktisi geoteknik/konstruksi berpengalaman.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  }));

  return response.text;
};

// Helper for exponential backoff on 429 errors
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let delay = 30000; // Start with 30s as Gemini 1.5/2.0 often have long rate limit windows for free tier
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = JSON.stringify(error).includes("RESOURCE_EXHAUSTED") || 
                           error.message?.includes("429") || 
                           error.status === 429;
      
      if (isQuotaError && i < maxRetries - 1) {
        console.warn(`Gemini Rate Limit reached. Retrying in ${delay/1000}s... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded for Gemini API");
}

export const generateSEOData = async (articleContent: string, mainKeyword: string) => {
  const ai = getGemini();
  
  const prompt = `
    Berdasarkan artikel di bawah ini, buatkan data SEO yang optimal untuk publikasi di website konstruksi.

    ARTIKEL:
    ${articleContent}

    INSTRUKSI:
    Buatlah data SEO berikut dalam format SATU BARIS (Data saja) di mana setiap kolom dipisahkan oleh karakter TAB (\t):
    1. Judul: Judul artikel yang menarik (MURNI TEKS, TANPA SIMBOL seperti : ; & - | atau lainnya).
    2. Judul SEO: Judul untuk meta tag SEO (maks. 60 karakter, MURNI TEKS, TANPA SIMBOL).
    3. Slug: URL friendly (huruf kecil, tanda hubung).
    4. Meta Deskripsi: Ringkasan untuk meta tag (±140 karakter).
    5. Kutipan: Ringkasan singkat artikel (1 paragraf).
    6. Tag: Daftar tag relevan (maks. 5 item, pisahkan dengan koma).

    ATURAN:
    - Hanya keluarkan SATU BARIS teks.
    - DILARANG KERAS menggunakan simbol baca seperti titik dua (:), titik koma (;), ampersand (&), pipe (|), atau tanda kurung dalam Judul dan Judul SEO.
    - Gunakan karakter TAB sebagai pemisah antar kolom.
    - Jangan sertakan header, teks lain, atau penjelasan.
    - Gunakan bahasa Indonesia yang profesional.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  }));

  return response.text;
};
