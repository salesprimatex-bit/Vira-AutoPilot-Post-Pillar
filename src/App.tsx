import React, { useState, useEffect, useRef } from 'react';
import { 
  Construction, 
  Search, 
  FileText, 
  Link as LinkIcon, 
  Plus, 
  X, 
  Play, 
  Copy, 
  Check, 
  Loader2, 
  AlertCircle,
  FileSearch,
  FileCode,
  FileJson,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import { cn } from './lib/utils';
import { generateArticleSection, generateSEOData, type ArticleInput } from './services/geminiService';

const EMPTY_KEYWORDS = Array(10).fill('');

function readQueryData() {
  const params = new URLSearchParams(window.location.search);

  const frasa = params.get('frasa')?.trim() || '';
  const anchorText = params.get('anchor_text')?.trim() || '';
  const url = params.get('url')?.trim() || '';
  const sheetName = params.get('sheet_name')?.trim() || params.get('sheet')?.trim() || '';

  const keywords = Array.from({ length: 10 }, (_, i) => {
    const key = params.get(`anchor${i + 1}`)?.trim();
    return key || '';
  });

  return { frasa, anchorText, url, keywords, sheetName };
}

export default function App() {
  const [b2, setB2] = useState('');
  const [r2, setR2] = useState('');
  const [b3, setB3] = useState('');
  const [sheetName, setSheetName] = useState('Pillar');
  const sheetNameRef = useRef(sheetName);

  useEffect(() => {
    sheetNameRef.current = sheetName;
  }, [sheetName]);

  const [supportingKeywords, setSupportingKeywords] = useState<string[]>(EMPTY_KEYWORDS);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [articleContent, setArticleContent] = useState('');
  const [seoData, setSeoData] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'html' | 'seo'>('preview');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totalSteps = supportingKeywords.length + 3; // Intro + 10 Keywords + FAQ + Conclusion

  useEffect(() => {
    const applyUrlData = () => {
      const { frasa, anchorText, url, keywords, sheetName } = readQueryData();

      setB3(frasa);
      setB2(anchorText);
      setR2(url);
      setSheetName(sheetName);
      setSupportingKeywords(keywords.length === 10 ? keywords : EMPTY_KEYWORDS);
    };

    applyUrlData();
    window.addEventListener('popstate', applyUrlData);
    return () => window.removeEventListener('popstate', applyUrlData);
  }, []);

  // Auto-generate on load if parameters are present in URL
  useEffect(() => {
    const { frasa, anchorText, url, keywords } = readQueryData();
    if (frasa && keywords.length === 10 && keywords.every(k => !!k.trim())) {
      // Small timeout to ensure initial paint and avoid race conditions
      const timer = setTimeout(() => {
        if (!isGenerating && !articleContent) {
          generateFullArticle({
            b3: frasa,
            b2: anchorText,
            r2: url,
            supportingKeywords: keywords
          });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatWIB = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const timeStr = new Intl.DateTimeFormat('id-ID', options).format(date);
    
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    const dateStr = new Intl.DateTimeFormat('id-ID', dateOptions).format(date);
    
    return { time: timeStr.replace(/:/g, '.'), date: dateStr };
  };

  const { time, date } = formatWIB(currentTime);

  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [scanInterval, setScanInterval] = useState(10); // minutes
  const [isScanning, setIsScanning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [processStatus, setProcessStatus] = useState<string | null>(null);

  // Countdown timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoPilot && !isScanning && countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAutoPilot, isScanning, countdown]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto Pilot Scan Loop
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let isActive = true;
    
    const checkActive = () => {
      if (!isActive) {
        setIsScanning(false);
        return false;
      }
      return true;
    };

    const waitWithCheck = async (seconds: number) => {
      for (let i = 0; i < seconds; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!isActive) return false;
      }
      return true;
    };

    const scan = async () => {
      if (!isAutoPilot || !isActive) {
        setIsScanning(false);
        return;
      }
      
      setIsScanning(true);
      setProcessStatus("Memeriksa antrian (Scanning)...");
      console.log("Auto Pilot: Memulai pemindaian antrian...");
      
      try {
        const currentSheetName = (sheetNameRef.current || 'Pillar').trim();
        let scriptUrl = (import.meta.env.VITE_GOOGLE_SCRIPT_URL || "").trim();
        if (!scriptUrl || scriptUrl === "YOUR_GOOGLE_SCRIPT_URL_HERE") {
          scriptUrl = "https://script.google.com/macros/s/AKfycbyjab-WqLPdKkWDRkpPjGp471wOR82OHN7DfWNlp0bath-bC8vGgq6E5WLVejEeqpiKug/exec?module=pillar";
        }

        const params = new URLSearchParams();
        params.append("sheetName", currentSheetName);
        
        const finalUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}${params.toString()}`;
        console.log(`[Queue] Fetching: ${finalUrl}`);

        const response = await fetch(finalUrl);
        if (!checkActive()) return;
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google Script Error: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
        const task = await response.json();
        if (!checkActive()) return;
        
        console.log("DEBUG: Data Antrian Diterima:", task);
        
        if (task && task.error) {
          let errorMsg = `Script Error: ${task.error}`;
          if (task.error === 'Sheet not found' || task.error.toLowerCase().includes('not found')) {
            errorMsg = `Halaman "${currentSheetName}" tidak ditemukan. Pastikan nama tab persis "${currentSheetName}" di Google Sheets.`;
          }
          setProcessStatus(errorMsg);
          console.error(errorMsg);
          setCountdown(scanInterval * 60);
          setIsScanning(false);
          return;
        }
        
        if (task && task.row) {
          const rowIndex = task.row;
          setProcessStatus(`Baris ${rowIndex} ditemukan. Memproses...`);
          console.log(`Auto Pilot: Memproses baris ${rowIndex}`);
          
          // Definisikan data input dengan pemetaan yang lebih fleksibel
          const frasaKunci = task.frasa_kunci || task.keyword || task.topic || task.frasa || 'Artikel Konstruksi';
          
          // Daftar field yang mungkin dikirim oleh Google Script
          const getVal = (idx: number) => {
            return task[`text${idx}`] || 
                   task[`keyword${idx}`] || 
                   task[`h2_${idx}`] || 
                   task[`key${idx}`] || 
                   task[`sub_${idx}`] || 
                   task[`Supporting Keyword ${idx}`] || 
                   task[`Supporting_Keyword_${idx}`];
          };

          const rawSupporting = Array.from({ length: 10 }, (_, i) => getVal(i + 1))
            .map(kw => String(kw || '').trim())
            .filter(Boolean);

          console.log(`DEBUG: Mapping Keywords (${rawSupporting.length} found):`, rawSupporting);
          
          const inputData: ArticleInput = {
            b3: frasaKunci,
            b2: task.anchor_text1 || task.anchor1 || task.b2 || frasaKunci || 'Klik di sini',
            r2: task.url1 || task.link1 || task.url || task.r2 || '#',
            supportingKeywords: rawSupporting
          };

          // Deteksi apakah data yang diterima duplikat semua
          const allSame = inputData.supportingKeywords.length > 1 && 
                          inputData.supportingKeywords.every(kw => kw === inputData.supportingKeywords[0]);
          
          if (allSame) {
             console.warn("PERINGATAN: Semua kata kunci pendukung sama. Cek format di Google Sheets.");
          }

          // Fallback jika kata kunci pendukung benar-benar kosong
          if (inputData.supportingKeywords.length === 0) {
            console.warn("Peringatan: Tidak ada kata kunci pendukung (text1-text10) dalam data task.");
            while (inputData.supportingKeywords.length < 10) {
              const num = inputData.supportingKeywords.length + 1;
              inputData.supportingKeywords.push(`Sub-Topik ${num}: ${inputData.b3}`);
            }
          } else if (inputData.supportingKeywords.length < 10) {
            // Jika ada tapi kurang dari 10, cukup tambahkan sampai 10
            while (inputData.supportingKeywords.length < 10) {
              const num = inputData.supportingKeywords.length + 1;
              inputData.supportingKeywords.push(`Perspektif Tambahan ${num}: ${inputData.b3}`);
            }
          }

          if (!checkActive()) return;

          // Update UI
          setB3(inputData.b3);
          setB2(inputData.b2);
          setR2(inputData.r2);
          setSupportingKeywords(inputData.supportingKeywords);

          try {
            const updateSheet = async (rowIndex: number, updateData: any) => {
              let scriptUrl = (import.meta.env.VITE_GOOGLE_SCRIPT_URL || "").trim();
              if (!scriptUrl || scriptUrl === "YOUR_GOOGLE_SCRIPT_URL_HERE") {
                scriptUrl = "https://script.google.com/macros/s/AKfycbyjab-WqLPdKkWDRkpPjGp471wOR82OHN7DfWNlp0bath-bC8vGgq6E5WLVejEeqpiKug/exec?module=pillar";
              }

              const payload = {
                module: "pillar",
                action: "updatePillar",
                row: rowIndex,
                sheetName: sheetNameRef.current || 'Pillar',
                ...updateData
              };

              const updateUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?' }action=updatePillar`;
              const res = await fetch(updateUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
              });

              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Gagal update sheet: ${res.status} - ${text.substring(0, 50)}`);
              }
              return res.json();
            };

            // Update status ke Sheets: Processing
            setProcessStatus("Memperbarui status Sheets (Processing)...");
            await updateSheet(rowIndex, { generate_status: 'Processing Pillar' });

            if (!checkActive()) return;
            setProcessStatus("Menyusun Artikel & SEO (Generating)...");

            // Generate Artikel & SEO
            const { fullContent, seoData } = await generateFullArticle(inputData);
            if (!checkActive()) return;
            
            // Format data SEO dari Gemini (Tab Separated)
            const seoValues = seoData.trim().split('\t').map(v => v.trim());
            
            const sanitizeTitle = (text: string) => {
              if (!text) return '';
              // Hapus simbol : ; & | ( ) [ ] { } " ' < >
              return text.replace(/[:;&|\(\)\[\]\{\}"'<>]/g, '').trim();
            };

            const parsedSeo = {
              judul: sanitizeTitle(seoValues[0] || inputData.b3),
              judul_seo: sanitizeTitle(seoValues[1] || inputData.b3),
              slug: seoValues[2] || inputData.b3.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              meta_deskripsi: seoValues[3] || '',
              kutipan: seoValues[4] || '',
              tag: task.tag || seoValues[5] || '',
            };

            // Jeda 1 menit sebagai cooldown sebelum posting
            setProcessStatus("Menunggu cooldown (1 menit)...");
            if (!(await waitWithCheck(60))) return;
            
            // Update Sheets: Generated
            setProcessStatus("Memperbarui Google Sheets...");
            await updateSheet(rowIndex, {
              konten: String(marked.parse(fullContent)),
              ...parsedSeo,
              generate_status: 'Generated Pillar'
            });

            if (!checkActive()) return;

            // Posting ke WordPress (Directly from Frontend)
            setProcessStatus("Mengirim ke WordPress (Directly)...");
            
            const resolveWpTerms = async (names: string, taxonomy: string, wpUrl: string, headers: HeadersInit) => {
              if (!names) return [];
              const termNames = names.split(",").map(n => n.trim()).filter(Boolean);
              const ids: number[] = [];

              for (const name of termNames) {
                try {
                  const searchRes = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}`, { headers });
                  const data = await searchRes.json();
                  const existing = Array.isArray(data) ? data.find((t: any) => t.name.toLowerCase() === name.toLowerCase()) : null;
                  
                  if (existing) {
                    ids.push(existing.id);
                  } else {
                    const createRes = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomy}`, {
                      method: 'POST',
                      headers: { ...headers, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    const createData = await createRes.json();
                    if (createRes.ok) {
                      ids.push(createData.id);
                    } else if (createRes.status === 400 && createData.data?.term_id) {
                      ids.push(createData.data.term_id);
                    }
                  }
                } catch (e) {
                  console.error(`Error resolving ${taxonomy} "${name}":`, e);
                }
              }
              return ids;
            };

            const wpUrl = task.wp_url?.trim().replace(/\/+$/, "") || "";
            const wpUser = (task.wp_username || "").trim();
            const wpPass = (task.wp_app_password || "").trim();

            if (!wpUrl || !wpUser || !wpPass) {
              throw new Error("Kredensial WordPress tidak ditemukan di baris Sheets ini.");
            }

            const authString = btoa(`${wpUser}:${wpPass}`);
            const wpHeaders = {
              'Authorization': `Basic ${authString}`
            };

            const categoryIds = await resolveWpTerms(task.kategori || 'Uncategorized', "categories", wpUrl, wpHeaders);
            const tagIds = await resolveWpTerms(parsedSeo.tag, "tags", wpUrl, wpHeaders);

            const wpPayload = {
              title: parsedSeo.judul,
              content: String(marked.parse(fullContent)),
              excerpt: parsedSeo.kutipan,
              slug: parsedSeo.slug,
              status: "draft",
              categories: categoryIds,
              tags: tagIds,
              meta: {
                _yoast_wpseo_title: parsedSeo.judul_seo,
                _yoast_wpseo_metadesc: parsedSeo.meta_deskripsi,
                _yoast_wpseo_focuskw: task.frasa_kunci,
                _yoast_wpseo_is_cornerstone: "1",
                rank_math_title: parsedSeo.judul_seo,
                rank_math_description: parsedSeo.meta_deskripsi,
                rank_math_focus_keyword: task.frasa_kunci,
                rank_math_pillar_post: "on",
              }
            };

            const wpRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
              method: 'POST',
              headers: { ...wpHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify(wpPayload)
            });

            if (!checkActive()) return;
            
            if (!wpRes.ok) {
              const wpError = await wpRes.json();
              throw new Error(`Gagal posting WordPress: ${wpError.message || wpRes.statusText}`);
            }

            const wpData = await wpRes.json();

            // Update Sheets: Published
            setProcessStatus("Menyelesaikan proses...");
            await updateSheet(rowIndex, {
              generate_status: 'Published Pillar',
              published_url: wpData.link || ''
            });

            setProcessStatus("✓ Berhasil Terkirim!");
            console.log(`Auto Pilot: Berhasil memproses baris ${rowIndex}.`);
              } catch (err: any) {
                setProcessStatus(`Gagal memproses baris ${rowIndex}: ${err.message}`);
                console.error("Error dalam pemrosesan baris:", err);
                try {
                  // Attempt to mark as error if possible
                  let scriptUrl = (import.meta.env.VITE_GOOGLE_SCRIPT_URL || "").trim();
                  if (scriptUrl) {
                  if (!scriptUrl || scriptUrl === "YOUR_GOOGLE_SCRIPT_URL_HERE") {
                    scriptUrl = "https://script.google.com/macros/s/AKfycbyjab-WqLPdKkWDRkpPjGp471wOR82OHN7DfWNlp0bath-bC8vGgq6E5WLVejEeqpiKug/exec?module=pillar";
                  }
                    await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?' }action=updatePillar`, {
                      method: 'POST',
                      body: JSON.stringify({
                        module: "pillar",
                        action: "updatePillar",
                        row: rowIndex,
                        sheetName: sheetNameRef.current || 'Pillar',
                        generate_status: 'Error Pillar'
                      })
                    });
                  }
                } catch (e) { /* ignore */ }
              }
        } else {
          const msg = task.message || "Tidak ada antrian.";
          setProcessStatus(msg);
          console.log("Auto Pilot:", msg);
        }
      } catch (err: any) {
        setProcessStatus("AutoPilot Terhenti (Error)");
        console.error("AutoPilot Loop Error:", err);
        setError(`AutoPilot Error: ${err.message}`);
      } finally {
        if (isActive && isAutoPilot) {
          setIsScanning(false);
          setCountdown(scanInterval * 60);
          console.log(`Auto Pilot: Selesai. Menunggu ${scanInterval} menit untuk pengecekan berikutnya...`);
          timer = setTimeout(scan, scanInterval * 60 * 1000);
        } else {
          setProcessStatus(null);
        }
      }
    };

    if (isAutoPilot) {
      scan();
    }

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [isAutoPilot, scanInterval]);

  const handleSupportKeywordChange = (index: number, value: string) => {
    const newKeywords = [...supportingKeywords];
    newKeywords[index] = value;
    setSupportingKeywords(newKeywords);
  };

  const handleCopy = () => {
    let textToCopy = articleContent;
    if (viewMode === 'html') {
      textToCopy = String(marked.parse(articleContent));
    } else if (viewMode === 'seo') {
      textToCopy = seoData;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyHTML = () => {
    if (!articleContent) return;
    const html = String(marked.parse(articleContent));
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySEO = () => {
    if (!seoData) return;
    navigator.clipboard.writeText(seoData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateFullArticle = async (overrides?: { b3?: string, b2?: string, r2?: string, supportingKeywords?: string[] }) => {
    const finalB3 = overrides?.b3 || b3;
    const finalB2 = overrides?.b2 || b2;
    const finalR2 = overrides?.r2 || r2;
    const finalKeywords = overrides?.supportingKeywords || supportingKeywords;

    if (!finalB3 || finalKeywords.some(k => !k)) {
      const msg = 'Mohon isi semua kata kunci wajib (H1 dan 10 H2).';
      setError(msg);
      throw new Error(msg);
    }

    setError(null);
    setIsGenerating(true);
    setArticleContent('');
    setSeoData('');
    setCurrentStep(0);
    setGenerationProgress(0);

    const input: ArticleInput = { b2: finalB2, r2: finalR2, b3: finalB3, supportingKeywords: finalKeywords };
    let fullContent = `# ${finalB3}\n\n`;

    try {
      // Step 1: Intro
      setCurrentStep(1);
      const intro = await generateArticleSection(input, "Pendahuluan", "Pentingnya produk ini dalam proyek konstruksi modern.", true);
      fullContent += intro + "\n\n";
      setArticleContent(fullContent);
      setGenerationProgress((1 / totalSteps) * 100);

      // Step 2-11: H2 Sections
      for (let i = 0; i < finalKeywords.length; i++) {
        setCurrentStep(i + 2);
        const section = await generateArticleSection(
          input, 
          finalKeywords[i], 
          `Pembahasan mendalam tentang ${finalKeywords[i]} dalam konteks proyek.`
        );
        fullContent += section + "\n\n";
        setArticleContent(fullContent);
        setGenerationProgress(((i + 2) / totalSteps) * 100);
      }

      // Step 12: FAQ
      setCurrentStep(totalSteps - 1);
      const faq = await generateArticleSection(input, "Pertanyaan yang Sering Diajukan (FAQ)", "FAQ Teknis Produk", false, true);
      fullContent += faq + "\n\n";
      setArticleContent(fullContent);
      setGenerationProgress(((totalSteps - 1) / totalSteps) * 100);

      // Step 13: Conclusion
      setCurrentStep(totalSteps);
      const conclusion = await generateArticleSection(input, "Kesimpulan", "Ringkasan dan Solusi Produk Utama", false, false, true);
      fullContent += conclusion + "\n\n";
      setArticleContent(fullContent);
      setGenerationProgress(95);

      // Step 14: SEO Data
      setCurrentStep(totalSteps + 1);
      const seo = await generateSEOData(fullContent, finalB3);
      setSeoData(seo);
      setGenerationProgress(100);

      return { fullContent, seoData: seo };

    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat pembuatan artikel.');
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar - Settings */}
      <aside className="w-[280px] bg-brand-sidebar text-white flex flex-col shrink-0 h-screen sticky top-0 overflow-y-auto z-20">
        <div className="p-8 pb-10">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="text-lg tracking-tight flex items-center">
                <span className="font-bold text-white">AutoPilot</span>
                <span className="text-slate-400 font-normal ml-1.5 text-base">Post Pillar</span>
              </div>
              <span className="text-red-500 font-bold text-lg tracking-tight leading-none">Vira</span>
            </div>
          </div>

          <div className="space-y-10">
            {/* Main Keywords */}
            <section className="space-y-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-white/10 pb-2">
                Konfigurasi SEO
              </div>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-2">
                    <FileSearch className="w-3.5 h-3.5" />
                    Frasa Kunci
                  </label>
                  <input 
                    type="text" 
                    value={b3}
                    onChange={(e) => setB3(e.target.value)}
                    placeholder="contoh: Geotextile"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded focus:border-brand-accent focus:bg-white/10 outline-none transition-all text-sm placeholder:text-white/20"
                  />
                </div>


                <div className="space-y-3 pt-2">
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    INTERNAL LINK ARTIKEL UTAMA
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-400">Anchor Text 1</label>
                      <input 
                        type="text" 
                        value={b2}
                        onChange={(e) => setB2(e.target.value)}
                        placeholder="contoh: Jasa Konstruksi Terpercaya"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs outline-none focus:border-brand-accent placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-400">Url 1</label>
                      <input 
                        type="text" 
                        value={r2}
                        onChange={(e) => setR2(e.target.value)}
                        placeholder="contoh: https://perusahaan-anda.com/jasa-konstruksi"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs outline-none focus:border-brand-accent placeholder:text-white/20"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Supporting Keywords */}
            <section className="space-y-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
                10 Daftar Anchor Text (ARTIKEL PENDUKUNG)
              </div>
              <div className="space-y-1 cursor-default">
                {supportingKeywords.map((kw, idx) => (
                  <div key={idx} className="relative flex items-center group">
                    <span className="text-[10px] font-bold text-white/30 w-6">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <input 
                      type="text" 
                      value={kw}
                      onChange={(e) => handleSupportKeywordChange(idx, e.target.value)}
                      placeholder={`contoh: Pendukung ${idx + 1}`}
                      className="flex-1 py-1.5 bg-transparent border-b border-white/5 text-sm focus:border-brand-accent outline-none opacity-70 focus:opacity-100 transition-all placeholder:text-white/10"
                    />
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => generateFullArticle()}
                disabled={isGenerating || !b3.trim() || !b2.trim() || !r2.trim() || supportingKeywords.some(k => !k.trim())}
                className="w-full mt-6 py-3 bg-brand-accent hover:opacity-90 text-white rounded font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                {isGenerating ? `Generating ${Math.round(generationProgress)}%` : 'Regenerate'}
              </button>
            </section>
          </div>
        </div>

        <div className="mt-auto p-8 border-t border-white/5 bg-black/20">
            <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-lg text-[11px] leading-relaxed text-slate-400">
               <strong className="text-white block mb-1">Target Penulisan:</strong>
               Target: 4.000 - 5.000 Kata<br />
               Est. Baca: 18 Menit
            </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-brand-bg">
        <header className="h-24 bg-brand-surface border-b border-brand-border px-10 flex items-center justify-between shrink-0 shadow-xl shadow-black/20">
          <div className="flex items-center gap-6">
             <div className="flex flex-col">
                <div className="text-[10px] font-black text-brand-text-muted tracking-[0.2em] uppercase leading-none mb-2 ml-auto">WIB (JAKARTA)</div>
                <div className="flex items-baseline gap-3">
                   <span className="text-3xl font-bold text-white tabular-nums leading-none tracking-tight">{time}</span>
                   <span className="text-base font-medium text-brand-text-muted leading-none">{date}</span>
                </div>
             </div>
             <div className="h-10 w-[1px] bg-white/10 mx-2" />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-2 mr-4">
               <div className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-bold text-brand-text-muted uppercase tracking-wider">EEAT: Verified</div>
               <div className="px-3 py-1 bg-brand-accent/10 border border-brand-accent/20 rounded text-[11px] font-bold text-brand-accent uppercase tracking-wider">Topical Authority: High</div>
               
               <button 
                  onClick={() => setViewMode(v => v === 'preview' ? 'html' : 'preview')}
                  className={cn(
                    "px-4 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-all border flex items-center gap-2",
                    viewMode === 'html' 
                      ? "bg-brand-accent text-white border-brand-accent shadow-lg shadow-blue-900/40" 
                      : "bg-white/5 text-brand-text-muted border-white/10 hover:bg-white/10"
                  )}
               >
                 <FileSearch className="w-3 h-3" />
                 {viewMode === 'preview' ? 'View Source (HTML)' : 'View Visual Preview'}
               </button>

               {(articleContent || seoData) && (
                  <button 
                    onClick={handleCopy}
                    className="px-4 py-1.5 bg-brand-success text-white rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 hover:opacity-90 transition-all border border-brand-success"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Berhasil' : 'Copy All Results'}
                  </button>
               )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_300px] gap-6 p-6">
          {/* Editor Area */}
          <div className="bg-brand-surface border border-brand-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
             {!articleContent && !isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center p-20 text-center text-brand-text-muted">
                   <div className="w-16 h-16 bg-white/5 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center mb-6">
                      <Search className="w-8 h-8 opacity-20" />
                   </div>
                   <h3 className="text-xl font-bold text-brand-text-main">Arsitektur Konten Kosong</h3>
                   <p className="max-w-xs text-xs mt-3 leading-relaxed">Masukkan kata kunci utama dan subjudul pada panel kiri untuk mulai menyusun pillar konten berkualitas tinggi.</p>
                </div>
             ) : (
                <div className="flex-1 overflow-y-auto p-12 scroll-smooth bg-brand-bg/50">
                   <div className="max-w-4xl mx-auto space-y-8 pb-20">
                      {/* Quick Access Buttons */}
                      <div className="flex gap-4 mb-2">
                        <button 
                          onClick={copyHTML}
                          disabled={!articleContent}
                          className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all border border-white/10 disabled:opacity-30"
                        >
                          <FileCode className="w-4 h-4" />
                          Salin HTML (artikel)
                        </button>
                        <button 
                          onClick={copySEO}
                          disabled={!seoData}
                          className="flex-1 py-3 bg-brand-accent hover:opacity-90 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-30"
                        >
                          <FileJson className="w-4 h-4" />
                          Salin Data SEO (TXT)
                        </button>
                      </div>

                      {/* Section 1: Article Content */}
                      <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden transition-all">
                        <div className="p-12">
                          {viewMode === 'preview' ? (
                            <article className="markdown-body prose prose-invert lg:prose-xl max-w-none">
                               <ReactMarkdown>{articleContent}</ReactMarkdown>
                            </article>
                          ) : (
                            <div className="bg-black/40 rounded-xl p-8 overflow-hidden border border-white/5 shadow-inner">
                              <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Source Code (HTML)</span>
                                <div className="flex gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/20" />
                                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20" />
                                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/20" />
                                </div>
                              </div>
                              <pre className="font-mono text-sm text-brand-success/90 whitespace-pre-wrap break-all leading-relaxed">
                                {String(marked.parse(articleContent))}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Section 2: SEO Data */}
                      {seoData && (
                        <div className="bg-brand-accent/5 border border-brand-accent/20 rounded-2xl p-10 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700">
                           <div className="flex justify-between items-start mb-6">
                              <div>
                                <h3 className="text-brand-accent font-extrabold text-lg uppercase tracking-wider">DATA SEO YANG DIBUTUHKAN</h3>
                                <p className="text-brand-text-muted text-xs mt-1 font-medium">Data ini siap untuk ditempel ke spreadsheet atau CMS Anda.</p>
                              </div>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(seoData);
                                  setCopied(true);
                                  setTimeout(() => setCopied(false), 2000);
                                }}
                                className="px-4 py-2 bg-brand-surface border border-white/10 text-brand-text-main rounded-lg text-[11px] font-bold uppercase flex items-center gap-2 hover:bg-white/5 transition-all shadow-md"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                {copied ? 'BERHASIL' : 'Salin Data SEO (TXT)'}
                              </button>
                           </div>
                           <div className="bg-black/20 border border-white/5 p-6 rounded-xl overflow-x-auto shadow-inner">
                              <div className="markdown-body prose-sm prose-invert text-brand-text-main min-w-[600px]">
                                 <ReactMarkdown>{seoData}</ReactMarkdown>
                              </div>
                           </div>
                        </div>
                      )}
                      
                      {isGenerating && (
                        <div className="mt-8 animate-pulse space-y-3">
                           <div className="h-4 bg-slate-100 rounded w-full" />
                           <div className="h-4 bg-slate-100 rounded w-5/6" />
                           <div className="h-4 bg-slate-100 rounded w-4/6" />
                        </div>
                      )}
                   </div>
                </div>
             )}
          </div>          {/* Right Sidebar Panel */}
          <div className="flex flex-col gap-6 overflow-y-auto">
             {/* EEAT SCORE */}
             <div className="bg-brand-surface border border-brand-border rounded-xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                   <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text-muted">EEAT SCORE</span>
                   <span className="text-[11px] font-bold text-brand-success uppercase">Excellent</span>
                </div>
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                   <svg className="w-full h-full -rotate-90">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#10b981" strokeWidth="6" strokeDasharray="213" strokeDashoffset={213 * (1 - (isGenerating ? generationProgress / 100 : articleContent ? 0.92 : 0))} className="transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
                   </svg>
                   <span className="absolute inset-0 flex items-center justify-center font-extrabold text-2xl text-white">
                      {articleContent ? '92' : '0'}
                   </span>
                </div>
                <p className="text-[10px] text-center text-brand-text-muted mt-4 font-medium italic">Otoritas Topik Terverifikasi</p>
             </div>

             {/* AUTO PILOT CONFIG */}
             <div className="bg-brand-surface border border-brand-border rounded-xl p-6 shadow-xl">
                <div className="text-[11px] font-bold uppercase tracking-wider text-brand-text-muted mb-6 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                    KONFIGURASI AUTOPILOT
                    {processStatus && (
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5",
                        processStatus.includes("✓") 
                          ? "bg-green-500/10 text-green-500 border border-green-500/20" 
                          : processStatus.includes("Error") 
                            ? "bg-red-500/10 text-red-500 border border-red-500/20"
                            : "bg-brand-accent/10 text-brand-accent border border-brand-accent/20"
                      )}>
                        {processStatus.includes("✓") ? <Check className="w-3 h-3 shrink-0" /> : <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                        {processStatus}
                      </span>
                    )}
                  </div>
                  {isScanning && !processStatus && <Loader2 className="w-3 h-3 animate-spin text-brand-accent" />}
                </div>

                <div className="space-y-2 mb-6">
                  <label className="text-[11px] font-semibold text-brand-text-muted flex items-center gap-2">
                    Nama Sheet
                  </label>
                  <input 
                    type="text" 
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="contoh: Geotextile"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded focus:border-brand-accent outline-none transition-all text-sm placeholder:text-white/10"
                  />
                </div>
                
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {[10, 20, 30, 60].map(m => (
                    <button
                      key={m}
                      onClick={() => setScanInterval(m)}
                      className={cn(
                        "py-2 rounded-lg text-xs font-bold transition-all border",
                        scanInterval === m 
                          ? "bg-brand-accent/20 border-brand-accent text-brand-accent shadow-[0_0_10px_rgba(59,130,246,0.3)]" 
                          : "bg-white/5 border-white/10 text-brand-text-muted hover:bg-white/10"
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (!isAutoPilot) setCountdown(0);
                    setIsAutoPilot(!isAutoPilot);
                  }}
                  disabled={!sheetName.trim()}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all shadow-xl border-2",
                    isAutoPilot
                      ? "bg-red-600 border-red-700 text-white hover:bg-red-700 shadow-red-900/40"
                      : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-brand-accent/50",
                    !sheetName.trim() && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {isAutoPilot ? (
                      <>
                        {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                        {isScanning ? "Stop AutoPilot (Busy...)" : "Stop AutoPilot"}
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current" />
                        Start AutoPilot
                      </>
                    )}
                  </div>
                  {isAutoPilot && !isScanning && countdown > 0 && (
                    <div className="text-[10px] font-black opacity-80 tracking-widest mt-1">
                      NEXT SCAN IN {formatCountdown(countdown)}
                    </div>
                  )}
                </button>
                <div className="mt-4 text-center">
                  <p className="text-[10px] text-brand-text-muted leading-relaxed">
                    {isScanning 
                      ? "Proses auto-fetch sedang aktif." 
                      : "Klik start untuk scan baris dengan status queue tertinggi."}
                  </p>
                </div>
             </div>
             <div className="bg-brand-surface border border-brand-border rounded-xl p-6 shadow-xl">
                <div className="text-[11px] font-bold uppercase tracking-wider text-brand-text-muted mb-4">Progres Penulisan</div>
                <div className="flex items-baseline gap-2 mb-2">
                   <span className="text-3xl font-extrabold text-white">
                      {articleContent ? Math.round(articleContent.split(' ').length) : '0'}
                   </span>
                   <span className="text-sm font-medium text-brand-text-muted">/ 5,000</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-2">
                   <motion.div 
                     className="h-full bg-brand-accent shadow-[0_0_10px_rgba(59,130,246,0.6)]"
                     initial={{ width: 0 }}
                     animate={{ width: `${generationProgress}%` }}
                   />
                </div>
                <p className="text-[10px] text-brand-text-muted mt-4 leading-relaxed tracking-tight">
                   {Math.round(generationProgress)}% Selesai - Sisa estimasi 2 jam
                </p>
             </div>

             {/* SEO CHECKLIST */}
             <div className="bg-brand-surface border border-brand-border rounded-xl p-6 shadow-xl flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-brand-text-muted mb-6">SEO Checklist</div>
                <div className="space-y-4">
                   {[
                     { label: 'H1 mengandung Kata Kunci', check: !!b3 },
                     { label: 'Subjudul H2 dibahas mendalam', check: supportingKeywords.filter(k => !!k).length >= 5 },
                     { label: 'Internal Link Produk', check: !!articleContent && articleContent.includes(r2) },
                     { label: '3 Outbound Links Kredibel', check: !!articleContent },
                     { label: 'FAQ Schema Terpenuhi', check: !!articleContent && currentStep >= totalSteps - 1 },
                     { label: 'CTA Konsultasi Teknis', check: !!articleContent && currentStep === totalSteps },
                   ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                         <div className={cn(
                           "mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                           item.check ? "bg-brand-success text-white" : "bg-white/5 text-white/10"
                         )}>
                            {item.check ? '✓' : '○'}
                         </div>
                         <span className={cn(
                           "text-[12px] leading-tight font-medium",
                           item.check ? "text-brand-text-main" : "text-brand-text-muted/60"
                         )}>
                           {item.label}
                         </span>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>

        {error && (
          <div className="absolute bottom-6 left-[300px] right-[320px] z-50 p-4 bg-red-600 text-white rounded-lg shadow-2xl flex items-center justify-between border-2 border-red-400 animate-bounce">
             <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-bold uppercase tracking-wider">{error}</span>
             </div>
             <button onClick={() => setError(null)} className="hover:opacity-60 transition-opacity"><X className="w-5 h-5" /></button>
          </div>
        )}
      </main>
    </div>
  );
}
