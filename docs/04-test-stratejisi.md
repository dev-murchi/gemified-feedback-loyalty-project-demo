# Geri Bildirim ve Sadakat Motoru – Test Stratejisi

9 Ekim 2026 · Murat Çay

## 1. Amaç

Bu doküman, gereksinimlerin (SRS v1.5) ve tasarım kararlarının (SDD v1.2) nasıl doğrulanacağını tanımlar. Odak, sistemin en pahalı hatalarıdır: çift veya kayıp ödül, markalar arası veri sızıntısı, sahte kimlikle ödül toplama ve fark edilmeden düşen AI kalitesi.

| Alan | Değer |
| --- | --- |
| Sürüm | 1.3 |
| Dayandığı dokümanlar | SRS v1.5, SDD v1.2, Tehdit Modeli v1.0, API sözleşmesi 0.2.2-demo |
| Değişiklik (1.3) | Test aracı Jest yerine Vitest: NestJS 12 yalnızca ESM; Vitest ESM'i doğal olarak destekler |

## 2. Test Seviyeleri ve Araçlar

| Seviye | Neyi doğrular | Araç | Ne zaman çalışır |
| --- | --- | --- | --- |
| Birim | Domain kuralları: ödül hakkı kuralları, seviye hesabı, durum geçişleri, maskeleme desenleri | Vitest | Her commit |
| Repository sözleşme | G-1..G-3 garantileri (atomik koşullu güncelleme, tekil kısıt, transaction) port seviyesinde tanımlanır; aynı test paketi önce bellek içi, sonra veritabanı adapter'ına karşı çalışır (SDD ADR-017) | Vitest | Her commit |
| Entegrasyon | Repository adapter'larının gerçek veritabanı ve Redis ile davranışı: atomik koşullu güncelleme, tekil kısıtlar, transaction sınırları, outbox | Vitest + Testcontainers (PostgreSQL, Redis) | Her commit |
| Eşzamanlılık | Aynı kullanıcı–şube için paralel istekler, tekrarlanan worker işleri | Testcontainers + paralel istemciler | Her commit |
| Sözleşme | Uygulamanın ürettiği OpenAPI'nin `openapi.yaml` ile uyumu; Flutter için sözleşmeden üretilen mock sunucu | OpenAPI karşılaştırma aracı, Prism | Her commit |
| Uçtan uca | Kayıt → yorum → analiz → ödül → B2B okuma akışı; sahte LLM ve geliştirme doğrulayıcısıyla | Supertest, Docker Compose | Her birleştirme |
| AI değerlendirme | Etiketleme kalitesi (NFR-AIQ-01) | Değerlendirme seti + ölçüm script'i | Prompt, model, sağlayıcı veya etiket değişikliğinde |
| Güvenlik | Kiracı izolasyonu, kimlik doğrulama negatif senaryoları, girdi sınırları; bağımlılık ve imaj taraması | Vitest, npm audit, Trivy | Her commit; kapsamlı tarama haftalık |
| Yük | 12 aylık hedefin tepe yükü (SDD 8.4) | k6 | Staging'de, sürüm öncesi |
| Dayanıklılık | LLM kesintisi, Redis kaybı, worker çökmesi | Staging'de hata enjeksiyonu | Sürüm öncesi |
| Felaket kurtarma | Yedekten geri dönüş ve RTO ölçümü | Staging tatbikatı | Üç ayda bir |

Test piramidi gözetilir: kuralların büyük kısmı hızlı birim testleriyle, veritabanı garantilerine dayanan kurallar ise mutlaka gerçek veritabanıyla entegrasyon testinde doğrulanır. Veritabanı garantileri sahte (mock) repository'lerle test edilmez.

## 3. Kritik Test Senaryoları

### 3.1 Ödül Hakkı ve Çift Kullanım

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-QR-01 | Aynı kullanıcı–şube için 20 paralel yorum isteği | Yalnızca biri kabul edilir | FR-QR-04 |
| TC-QR-02 | Ödüllü yorumdan 23 saat 59 dakika sonra yeni yorum | `REWARD_COOLDOWN` ile reddedilir | FR-QR-07 |
| TC-QR-03 | Deneme penceresinin 23. saatinde ödül alınıp pencere bittikten 1 saat sonra yeni yorum | `REWARD_COOLDOWN` ile reddedilir (önceki tasarım hatasının regresyon testi) | FR-QR-07 |
| TC-QR-04 | Spam sonrası yeni yorum | Kabul edilir; deneme sayısı 2 | FR-QR-09 |
| TC-QR-05 | Penceredeki 4. deneme | `ATTEMPTS_EXHAUSTED` ile reddedilir | FR-QR-09 |
| TC-QR-06 | Önceki yorum incelenirken yeni yorum | `FEEDBACK_PENDING` ile reddedilir | FR-QR-07 |
| TC-QR-07 | Bilinmeyen, iptal edilmiş, biçimi bozuk token | `QR_INVALID`; deneme loglanır | FR-QR-02, FR-QR-05 |
| TC-QR-09 | Denemeler T, T+23:58 ve T+23:59'da; ardından T+24:01'de 4. ve T+24:02'de 5. deneme | 4. deneme kabul edilir (son 24 saatte 2 deneme var); 5. deneme `ATTEMPTS_EXHAUSTED` ile reddedilir. Fixed window bu durumda 5. denemeyi de kabul ederdi (regresyon testi) | FR-QR-09, ADR-016 |
| TC-QR-08 | Gecikmeli eski bir analiz işinin yeni bir yorumun kilidini açmaya çalışması | Etkisiz kalır (`pending_feedback_id` koşulu) | SDD 6.4 |

### 3.2 Ödül ve Ledger

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-GAM-01 | Aynı analiz işinin iki kez çalışması | Tek ledger kaydı; cüzdan bir kez artar | FR-GAM-04 |
| TC-GAM-02 | Ödül sonrası iade | Ayrı `clawback` kaydı; bakiye düşer; negatifse hesap işaretlenir | FR-GAM-07 |
| TC-GAM-03 | Uygulama rolüyle ledger kaydını güncelleme veya silme denemesi | Veritabanı reddeder | FR-GAM-03 |
| TC-GAM-04 | Rastgele işlem dizilerinden sonra cüzdan–ledger uzlaştırması | Bakiye her zaman ledger toplamına eşit (özellik tabanlı test) | NFR-DATA-01 |
| TC-GAM-05 | Toplam XP 99, 100, 299, 300 | Seviye sırasıyla 1, 2, 2, 3; XP seviye atlayınca sıfırlanmaz | FR-GAM-02 |
| TC-GAM-06 | Analiz sonucu yazılırken transaction'ın ortasında hata | Ne analiz ne ödül yazılır; iş yeniden denendiğinde tutarlı sonuç | ADR-014 |

### 3.3 Kimlik ve Güven

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-AUTH-01 | Geçerli attestation ile kayıt | Kullanıcı, cüzdan, normal güven | FR-AUTH-01 |
| TC-AUTH-02 | Aynı nonce ile ikinci kayıt | Reddedilir | Tehdit T-S4 |
| TC-AUTH-03 | Süresi dolmuş nonce | Reddedilir | SDD 7.1 |
| TC-AUTH-04 | Başarısız attestation (geçersiz zincir, yanlış uygulama kimliği) | Düşük güven modunda hesap | FR-AUTH-06 |
| TC-AUTH-05 | iOS'ta sayacı artmayan assertion | Reddedilir | Tehdit T-S4 |
| TC-AUTH-06 | İptal edilmiş anahtarla oturum | Reddedilir | FR-AUTH-07 |
| TC-AUTH-07 | Gövdesi değiştirilmiş yorum isteği (kanıt eski gövdeye ait) | Düşük güven; ödül yok | FR-QR-10 |
| TC-AUTH-08 | Süresi dolmuş erişim token'ı | 401 | FR-AUTH-03 |
| TC-AUTH-09 | Üretim yapılandırmasında geliştirme doğrulayıcısının açılması | Uygulama başlamaz | Tehdit T-E3 |

Gerçek App Attest ve Play Integrity yanıtları otomatik testte üretilemediği için doğrulayıcılar, gerçek cihazlardan kaydedilmiş örnek attestation nesneleri ve elle hazırlanmış geçersiz varyantlarıyla test edilir. Gerçek cihaz testi staging'de yapılır.

### 3.4 B2B ve Kiracı İzolasyonu

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-B2B-01 | Her B2B uç noktasında A markasının token'ıyla B markasının kaynağı | 404 | FR-B2B-08 |
| TC-B2B-02 | Liste ve özetlerde spam yorum | Yer almaz | FR-B2B-07 |
| TC-B2B-03 | Yanıtlarda kullanıcı kimliği, cihaz anahtarı veya ham metin | Bulunmaz (yanıt şeması üzerinden otomatik kontrol) | FR-B2B-06, FR-B2B-07 |
| TC-B2B-04 | Kapsamı olmayan uç noktaya erişim | 403 | ADR-013 |
| TC-B2B-05 | İptal edilmiş veya süresi dolmuş istemci | Token alınamaz | FR-B2B-01 |
| TC-B2B-06 | Sayfalama sırasında yeni yorum eklenmesi | Tekrar eden veya atlanan kayıt yok | FR-B2B-03 |
| TC-B2B-07 | İstanbul saatiyle 23:30'da yapılan yorum, saat dilimi belirtilmeden günlük özet istendiğinde | Yorum İstanbul takvimindeki güne sayılır (UTC'deki bir önceki güne değil) | FR-B2B-10 |

### 3.5 API Sözleşmesi

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-API-01 | `REWARD_COOLDOWN` ve `ATTEMPTS_EXHAUSTED` retleri | `422`; kalan süre gövdedeki `retryAfterSeconds` alanında; `Retry-After` başlığı yok | API hata kataloğu |
| TC-API-02 | Emoji içeren 1.000 ve 1.001 karakterlik yorum | 1.000 kabul edilir; 1.001 `422 TEXT_TOO_LONG` (genel `400` değil); sayım NFC sonrası kod noktası | FR-AI-01 |
| TC-API-03 | Her uç noktanın başarı ve hata yanıtları, OAuth2 hataları dahil | `X-Request-Id` başlığı var | NFR-OBS-01 |
| TC-API-04 | `from` / `to` parametrelerinde tarih, tarih-saat ve geçersiz biçim | Tarih ve tarih-saat kabul edilir; geçersiz biçim `400 VALIDATION_ERROR` | FR-B2B-10 |

### 3.6 Yapay Zeka Akışı

| ID | Senaryo | Beklenen sonuç | Gereksinim |
| --- | --- | --- | --- |
| TC-AI-01 | 1.001 karakterlik yorum | `TEXT_TOO_LONG`; LLM çağrılmaz | FR-AI-01 |
| TC-AI-02 | Şemaya uymayan LLM yanıtı | Reddedilir, yeniden denenir | FR-AI-03 |
| TC-AI-03 | LLM kesintisi | Yorum kaybolmaz; denemeler üstel beklemeyle sürer ve durum `analyzing` kalır; kesinti bitince analiz tamamlanır | FR-AI-05 |
| TC-AI-04 | 24 saat analiz edilemeyen, ön kontrolden geçmiş yorum | Geçerli sayılır, ödül verilir, B2B'de "analiz edilemedi" | FR-AI-09 |
| TC-AI-05 | Aynı durum, bütçe koruması devredeyken | Otomatik onay uygulanmaz | FR-AI-09, FR-AI-12 |
| TC-AI-06 | Telefon, e-posta, plaka, T.C. kimlik içeren metin | LLM'e giden metinde maskelenmiş | FR-AI-07 |
| TC-AI-07 | Uygulama logları | Yorum metni ve kişisel veri içermez | NFR-PRIV-02 |
| TC-AI-08 | Bütçenin %80 ve %100'ü | Uyarı; yeni analizler bekletilir | FR-AI-12 |
| TC-AI-09 | Kontrol hanesi geçersiz 11 haneli sayı (ör. sipariş numarası) ve geçerli T.C. kimlik numarası | Yalnızca geçerli olan `[TCKN]` ile maskelenir | FR-AI-07, SDD 8.6 |
| TC-AI-10 | Küfür içeren gerçek bir şikayet | Spam sayılmaz (değerlendirme setinde de yer alır) | FR-AI-08, SDD 8.1 |

## 4. AI Değerlendirme Süreci

1. **Set:** Sektör başına en az 300 etiketli Türkçe yorum. Gerçek dağılımı yansıtan örneklere ek olarak zor durumlar bilinçli olarak eklenir: kısa ve öfkeli gerçek şikayetler, alaycı ifadeler, karışık duygular, spam ve prompt injection örnekleri.
2. **Etiketleme:** İki kişi bağımsız etiketler; uyuşmazlıklar üçüncü bir kişiyle karara bağlanır.
3. **Ölçüm:** Duygu için makro-F1, konu için doğruluk, spam kararı için kesinlik ve duyarlılık; sonuçlar prompt ve model sürümüyle birlikte saklanır.
4. **Kapı:** Hedeflerin (NFR-AIQ-01) altında kalan değişiklik birleştirilemez.
5. **Büyütme:** Haftalık insan örneklemesinde bulunan hatalar sete eklenir (NFR-AIQ-02).

Değerlendirme gerçek LLM çağrısı yaptığı için maliyetlidir; her commit'te değil, yalnızca AI davranışını etkileyen değişikliklerde çalışır.

## 5. Performans ve Dayanıklılık

| Test | Senaryo | Başarı ölçütü |
| --- | --- | --- |
| Yük | 12 aylık hedefin tepe yükü: ~12 yorum/sn, ~60 mobil istek/sn, 30 dakika (SDD 8.4) | NFR-PERF-01..03 karşılanır; hata oranı < %0,1 |
| Ani yükselme | Tepe yükün 2 katı, 5 dakika | Otomatik ölçekleme devreye girer; analiz gecikmesi 2 dakika içinde hedefe döner |
| LLM kesintisi | Sağlayıcı 15 dakika yanıt vermez | Yorum kaybı yok; kesinti sonrası kuyruk eritilir |
| Redis kaybı | Redis yeniden başlatılır ve veri silinir | Outbox ve süpürücü sayesinde hiçbir yorum analizsiz kalmaz |
| Worker çökmesi | İş ortasında görev sonlandırılır | Çift ödül yok; iş yeniden işlenir |

Yük testinde LLM, gerçekçi gecikme dağılımına sahip sahte bir adapter'la değiştirilir; gerçek sağlayıcının kapasitesi ayrıca, düşük hacimli bir testle doğrulanır.

## 6. Kabul Testleri

Her user story'nin kabul kriterleri (SRS Bölüm 6) staging ortamında uçtan uca test olarak otomatikleştirilir ve müşteri demosunda gösterilir.

| User story | Test kümesi |
| --- | --- |
| US-01 Kayıtsız başlangıç | TC-AUTH-01, 04, 06 + gerçek cihazla staging testi |
| US-02 QR ile geri bildirim | TC-QR-01..09, TC-AI-01, TC-AUTH-07 |
| US-03 Seviye atlama | TC-GAM-01, 05 |
| US-04 Otomatik analiz | TC-AI-02..06, AI değerlendirme kapısı |
| US-05 Şube bazlı içgörü | TC-B2B-01..06 |
| US-06 Verilerimi silme | Silme talebi sonrası ham metnin silindiği, yorum ve ledger'ın anonimleştiği, anahtarın iptal edildiği uçtan uca test |

## 7. CI Kapıları ve Tamamlanma Tanımı

Bir değişiklik birleştirilmeden önce:

- Lint, tip kontrolü, birim, entegrasyon, eşzamanlılık, sözleşme ve güvenlik testleri geçer.
- Domain ve application katmanlarında satır kapsamı en az %80'dir; kapsam tek başına hedef değildir, kritik senaryolar (Bölüm 3) eksiksiz olmalıdır.
- Yüksek veya kritik seviyede bağımlılık açığı yoktur.
- AI davranışını etkileyen değişikliklerde değerlendirme kapısı geçer.
- Değişiklik bir gereksinimi etkiliyorsa ilgili test bu dokümanla eşlenmiştir.

Bir sürüm üretime alınmadan önce: staging'de kabul testleri, yük testi ve smoke testleri geçer.

## 8. Demo (Sprint 0) Test Alt Kümesi

Demo, müşteriye gösterilecek iddiaları kanıtlayan testlerle birlikte teslim edilir. Gerçek platform doğrulaması, yük, dayanıklılık ve felaket kurtarma testleri demo kapsamında değildir.

| Alan | Zorunlu testler | Neden |
| --- | --- | --- |
| Repository sözleşmesi | G-1..G-3 testleri, bellek içi ve veritabanı adapter'ına karşı | ADR-017'nin riskini kapatır |
| Ödül kuralları | TC-QR-01..09 | "Double-spending'i çözdük" iddiası |
| Ödül ve ledger | TC-GAM-01, 04, 05, 06 | Çift ödül olmadığı ve seviye hesabı |
| Kimlik | TC-AUTH-01, 02, 04, 08, 09 (`DevAttestationVerifier` ile) | Akışın ve düşük güven modunun çalıştığı |
| B2B | TC-B2B-01, 02, 03, 07 | Kiracı izolasyonu ve maskelenmiş veri |
| AI akışı | TC-AI-01, 02, 03, 06, 09, 10 | Uzunluk sınırı, şema doğrulama, maskeleme |
| Sözleşme | OpenAPI karşılaştırması, TC-API-01..04 | Flutter ekibine verilen sözleşmeye uyum |
| AI kalite | Sektör başına ~50 yorumluk başlangıç seti | Model seçimi (SDD ADR-018) |
