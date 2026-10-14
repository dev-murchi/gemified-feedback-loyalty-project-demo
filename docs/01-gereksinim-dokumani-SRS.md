# Geri Bildirim ve Sadakat Motoru – Gereksinim Dokümanı (MVP)

9 Ekim 2026 · Murat Çay

## 1. Doküman Bilgisi ve Amacı

Bu doküman, "Geri Bildirim ve Sadakat Motoru" backend'inin MVP sürümünde ne yapacağını tanımlar ve geliştirme ekibiyle yapılacak anlaşmanın temelidir.

| Alan | Değer |
| --- | --- |
| Doküman türü | Yazılım Gereksinim Spesifikasyonu (SRS) – MVP |
| Sürüm | 1.6 (v1.0 baseline + CR-002..CR-007; müşteri doğrulaması bekliyor) |
| Kaynak | Proje sahibinin paylaştığı proje tanım metni (`00-musteri-proje-metni.md`) |
| Kapsam | Yalnızca backend; mobil (Flutter) ve B2B panel arayüzü kapsam dışı |
| İlgili dokümanlar | Yazılım Tasarım Dokümanı (`02`), Tehdit Modeli (`03`), Test Stratejisi (`04`) |

Bu dokümandaki ifadeler üç türdedir:

- **Müşteri metnine dayanan gereksinimler:** Kaynak metinden doğrudan türetilmiştir (izlenebilirlik: Bölüm 11.1).
- **Ekip önerileri:** Metnin bıraktığı boşlukları doldurmak için ekibin önerdiği kararlardır; müşteri doğrulaması bekler (Bölüm 9.1, 9.2, 11.3).
- **Açık sorular:** Müşterinin yanıtlaması gereken, henüz önerisi olmayan konulardır (Bölüm 9.3).

Öncelikler MoSCoW yöntemiyle verilir: **M** (Must) = MVP'de zorunlu, **S** (Should) = MVP'de olmalı ama ertelenebilir.

## 2. Ürün Vizyonu ve İş Hedefleri

Fiziksel perakende markalarının (akaryakıt istasyonları, kahve zincirleri vb.) müşterilerinden QR kod üzerinden serbest metin geri bildirim toplayan, bunu yapay zeka ile analiz edip markalara anlamlı veri olarak sunan ve müşteriyi XP/puanla ödüllendiren oyunlaştırılmış bir platform.

**İş hedefleri (MVP):**

1. Müşterinin geri bildirim bırakma sürtünmesini en aza indirmek (kayıt formu yok, QR okut ve yaz).
2. Sahte cihaz, sahte hesap veya tekrarlı QR kullanımıyla puan ve veri manipülasyonunu engellemek.
3. Serbest metni otomatik olarak duygu ve konu etiketli yapılandırılmış veriye dönüştürmek; bu dönüşümün kalitesini ölçülebilir kılmak.
4. Geçerli her geri bildirimi XP ve seviye sistemiyle ödüllendirerek tekrar katılımı artırmak.
5. Anlaşmalı markalara şube bazlı içgörüleri güvenli bir REST API üzerinden sunmak.

MVP'nin amacı bu beş modülün **temel özelliklerinin** uçtan uca ve üretim kalitesinde çalıştığını göstermektir; ileri özellikler sonraki fazlarda eklenecektir.

## 3. Paydaşlar ve Aktörler

| Aktör | Tür | Sistemle ilişkisi |
| --- | --- | --- |
| Son kullanıcı (müşteri) | İnsan | Flutter uygulamasıyla QR okutur, yorum yazar, XP/puan biriktirir |
| Mobil uygulama (Flutter) | Sistem | Backend API'lerinin birincil istemcisi |
| Kurumsal marka (B2B müşteri) | İnsan/Sistem | Kendi yönetim panelinden B2B API ile veriyi çeker |
| LLM sağlayıcısı (OpenAI/Gemini vb.) | Harici sistem | Maskelenmiş yorum metnini analiz edip yapılandırılmış sonuç döner |
| Apple App Attest, Google Play Integrity | Harici sistem | Uygulamanın ve cihaz anahtarının gerçekliğini doğrular |
| Platform yöneticisi | İnsan | Markaları, şubeleri, QR kodlarını ve B2B istemcilerini tanımlar (bkz. V-4) |
| Proje sahibi | Paydaş | Ürün kararlarını verir |

## 4. Kapsam

Metin, beş modülün "temel özelliklerinin" MVP'de çalışmasını, diğerlerinin sonradan eklenmesini istiyor; aşağıdaki ayrım bu ifadenin ekip tarafından önerilen yorumudur (S-1).

| Modül | MVP içi (temel) | MVP dışı (sonraki faz) |
| --- | --- | --- |
| Lazy Auth ve Gölge Cüzdan | Platform tarafından doğrulanmış cihaz anahtarıyla anonim kullanıcı ve cüzdan; challenge–response oturum; düşük güven modu; anahtar iptali | Telefon numarasıyla hesaba bağlama (ilk öncelik), cihazlar arası cüzdan taşıma |
| Double-Spending güvenliği | Tahmin edilemez şube QR token'ı, cihaz–şube–24 saat kuralı, deneme sınırı, eşzamanlılık güvencesi, isteğe bağlı platform kanıtı, kimliğe bağlı hız sınırı | Kasa fişine basılan imzalı, süreli tek kullanımlık dinamik QR; konum doğrulama; gelişmiş risk skorlaması |
| AI (NLP) köprüsü | Maskeleme, LLM ile duygu + konu + geçerlilik analizi, sağlayıcı soyutlaması, sürümlü prompt, kalite değerlendirme seti, bütçe koruması | Gemini'ye fiilen geçiş / otomatik yedek sağlayıcı, çoklu dil, Türkçe varlık tanıma ile isim maskeleme |
| Oyunlaştırma motoru | Geçerli yorumda XP/puan, seviye hesaplama, değiştirilemez ledger, ters kayıtla ödül iadesi | Rozetler, görevler, liderlik tablosu, puanı ödüle çevirme, puan son kullanma tarihi |
| B2B Dashboard API | OAuth2 client credentials ile marka bazlı erişim; şube bazlı yorum/şikayet listesi, özetler ve ısı haritası verisi; denetim kaydı | Gerçek zamanlı akış, dışa aktarım, webhook, marka içi kullanıcı/rol yönetimi |
| Gizlilik (KVKK) | Aydınlatma ve rıza akışı, uygulama içinden silme talebi, saklama süreleri, şifreli ham metin | – |

**Kapsam dışı (tüm MVP):** Flutter arayüzleri, B2B panelin ön yüzü, ödeme/ödül kullanımı, yönetim paneli.

## 5. Fonksiyonel Gereksinimler

### 5.1 Tembel Kayıt (Lazy Auth) ve Gölge Cüzdan

Kimlik, istemcinin beyan ettiği bir cihaz kimliğine değil, cihazın güvenli donanımında üretilen ve Apple/Google tarafından doğrulanan bir anahtara dayanır (ADR-012).

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-AUTH-01 | Uygulama ilk açıldığında, form istenmeden, cihazın güvenli donanımında üretilen ve platform tarafından doğrulanan (iOS: App Attest; Android: Key Attestation + Play Integrity) bir anahtar ile anonim bir kullanıcı ve ona bağlı bir puan cüzdanı oluşturulmalıdır. | M |
| FR-AUTH-02 | Aynı doğrulanmış anahtarla tekrar gelindiğinde yeni kullanıcı açılmamalı, mevcut kullanıcı döndürülmelidir. | M |
| FR-AUTH-03 | Oturum, sunucunun ürettiği tek kullanımlık ve kısa ömürlü bir challenge'ın cihaz anahtarıyla imzalanmasıyla açılmalıdır. Sunucu en fazla 15 dakika geçerli bir erişim token'ı üretir; ağ üzerinden uzun ömürlü ve tekrar kullanılabilir bir sır taşınmaz. | M |
| FR-AUTH-04 | Cüzdan oluşturulduğunda XP = 0, puan = 0, seviye = 1 olmalıdır. | M |
| FR-AUTH-05 | Kullanıcı, cüzdan bakiyesini, XP'sini, seviyesini ve bir sonraki seviyeye kalan XP'yi sorgulayabilmelidir. | M |
| FR-AUTH-06 | Doğrulaması başarısız olan, emülatörde çalışan veya bütünlüğü bozulmuş cihazlar "düşük güven" modunda çalışmalıdır: kullanıcı yorum yazabilir ve yorum markanın verisine katkı sağlar, ancak XP ve puan kazanamaz. Kullanıcıya bu durum açık bir mesajla bildirilir. | M |
| FR-AUTH-07 | Bir cihaz anahtarı (sızma veya hile şüphesiyle) iptal edilebilmelidir; iptal edilen anahtarla oturum açılamaz. | M |
| FR-AUTH-08 | Risk sinyalleri (doğrulama sonucu, cihaz bütünlük seviyesi, hesap yaşı, işlem hızı, veri merkezi kaynaklı IP) kaydedilmeli ve hesap bazlı bir risk değerlendirmesinde kullanılmalıdır. | S |

### 5.2 Double-Spending (Çift Kullanım) Güvenliği

"24 saat", takvim günü değil, UTC zaman damgalarıyla hesaplanan kayan bir penceredir.

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-QR-01 | Her şube QR'ı en az 128 bit rastgelelikte, tahmin edilemez bir token taşımalı, bir marka ve şubeye bağlı olmalı, iptal edilip yerine yenisi üretilebilmelidir. QR içeriği platformun alan adındaki bir bağlantıdır. | M |
| FR-QR-02 | Bilinmeyen, iptal edilmiş veya biçimi bozuk bir QR token'ı reddedilmelidir. | M |
| FR-QR-03 | Sistem, QR'ın kural gereği daha önce kullanılıp kullanılmadığını denetlemeli ve tekrar kullanımın ödül kazandırmasını engellemelidir. | M |
| FR-QR-04 | Aynı kullanıcıdan aynı şube için gelen eşzamanlı isteklerde yalnızca birinin kabul edilmesi veritabanı seviyesinde garanti edilmelidir; farklı kullanıcılar aynı sabit QR'ı serbestçe kullanabilir. | M |
| FR-QR-05 | Reddedilen her deneme, sebebiyle birlikte loglanmalıdır. | S |
| FR-QR-06 | Kimliği doğrulanmış isteklerde hız sınırları doğrulanmış cihaz kimliğine bağlı uygulanmalıdır. IP adresi, mobil operatörlerin binlerce kullanıcıyı aynı IP'den çıkarması (CGNAT) nedeniyle bu isteklerde tek başına sınır anahtarı olarak kullanılmamalıdır. Kimlik doğrulama öncesi uç noktalarda (challenge, kayıt, oturum) kimlik bulunmadığından yalnızca geniş eşikli IP sınırları uygulanır (CR-005). | M |
| FR-QR-07 | Bir kullanıcı aynı şubede, bir önceki ödüllü yorumunun gönderim zamanından itibaren 24 saat geçmeden yeniden ödül kazanamaz. Ödül hakkı yalnızca geçerli sayılan (veya FR-AI-09 gereği geçerli kabul edilen) yorumla tüketilir. Bir yorum incelenirken aynı şubeye yeni yorum gönderilemez. Süre yapılandırılabilir olmalıdır. | M |
| FR-QR-08 | QR doğrulama mantığı, sonraki fazdaki imzalı, süreli ve tek kullanımlık dinamik QR'ı destekleyecek şekilde genişletilebilir olmalıdır. | S |
| FR-QR-09 | Bir kullanıcı aynı şubede herhangi bir 24 saatlik aralıkta en fazla 3 yorum gönderebilir; spam sayılan yorum ödül hakkını tüketmez ama deneme hakkını tüketir. Deneme sayısı yapılandırılabilir olmalıdır. | M |
| FR-QR-10 | Ödül kazandırabilecek yorum gönderimi, istek gövdesinin özetine bağlanmış bir platform kanıtı (iOS: App Attest assertion; Android: Play Integrity token) taşımalıdır. Kanıtı eksik veya geçersiz istek düşük güven modunda işlenir. | M |

### 5.3 Yapay Zeka (NLP) Köprüsü

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-AI-01 | Geçerli bir QR ile gönderilen yorum 20 ile 1.000 karakter arasında olmalıdır; istek gövdesi en fazla 8 KB olabilir. Yorum önce veritabanına kaydedilmeli, kullanıcıya hemen "analiz ediliyor" durumuyla yanıt dönülmelidir. | M |
| FR-AI-02 | Kaydedilen yorum anlık olarak arka planda bir LLM API'sine gönderilmeli ve yapılandırılmış sonuç alınmalıdır. | M |
| FR-AI-03 | LLM yanıtı önceden tanımlı bir şemaya göre doğrulanmalı; uymayan yanıt reddedilip yeniden denenmelidir. | M |
| FR-AI-04 | Duygu sabit 5 etiketten, konu ise şubenin sektörüne ait sürümlü listeden seçilmeli; listeler veri olarak güncellenebilmelidir. | M |
| FR-AI-05 | LLM hatası veya zaman aşımında yorum kaybolmamalıdır. Analiz, aralıkları giderek açılan (üstel bekleme) denemelerle 24 saat boyunca sürdürülür; bu süre boyunca yorumun durumu "analiz ediliyor" kalır. 24 saatin sonunda FR-AI-09 uygulanır. Kullanıcıya görünen bir "başarısız" durumu yoktur (CR-005). | M |
| FR-AI-06 | LLM sağlayıcısı (OpenAI, Gemini vb.), iş mantığı değişmeden değiştirilebilir olmalıdır. | M |
| FR-AI-07 | Yorum metni LLM'e gönderilmeden önce telefon, e-posta, plaka ve T.C. kimlik numarası gibi kişisel veriler maskelenmelidir. İsimlerin desen tabanlı maskelenmesinin sınırlı olduğu bilinen bir kısıttır (SDD TZ-8). | M |
| FR-AI-08 | LLM, metnin anlamlı bir geri bildirim olup olmadığını (geçerli / spam) da döndürmelidir. | M |
| FR-AI-09 | Teknik bir aksaklık nedeniyle 24 saat içinde analiz edilemeyen yorum "analiz edilemedi" olarak kapatılır ve kullanıcının o şubedeki bekleyen yorum kilidi açılır; yorum B2B yanıtlarında "analiz edilemedi" durumuyla yer alır. Yorum, gönderim anında ödüle uygunsa (normal güven ve geçerli platform kanıtı, FR-QR-10) ve bütçe koruması (FR-AI-12) devrede değilse ödüllendirilir; aksi halde ödülsüz kapatılır. AI dışı ön kontrolden geçemeyen yorum spam sayıldığı için bu aşamaya gelmez. *(Ekip önerisi; müşteri doğrulaması bekliyor, CR-007.)* | M |
| FR-AI-10 | Yorum gönderimi idempotent olmalıdır: istemci her yorum için bir Idempotency-Key gönderir; aynı anahtarla tekrar gelen istek yeni yorum oluşturmaz, ilk isteğin sonucunu döner. | M |
| FR-AI-11 | Her analiz; kullanılan model, prompt sürümü ve etiket listesi sürümüyle birlikte kaydedilmelidir. Prompt veya model değişikliği, değerlendirme setinde kalite hedeflerini (NFR-AIQ-01) karşılamadan yayına alınamaz. | M |
| FR-AI-12 | Aylık LLM harcaması izlenmelidir. Bütçenin %80'inde yöneticiye uyarı gider; %100'ünde yeni analizler kuyrukta bekletilir ve alarm üretilir. Bütçe koruması devredeyken 24 saati dolan bekleyen yorumlar FR-AI-09 uyarınca ödülsüz kapatılır; kullanıcı o şubede yeni yorum gönderebilir. *(Ekip önerisi; müşteri doğrulaması bekliyor, CR-007.)* | M |

### 5.4 Oyunlaştırma (Gamification) Motoru

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-GAM-01 | Geçerli sayılan her yorumda kullanıcıya 10 XP ve 5 puan verilmelidir; değerler yapılandırılabilir olmalıdır. | M |
| FR-GAM-02 | Seviye, toplam XP'den türetilir: L seviyesine ulaşmak için gereken toplam XP = 100 × L × (L − 1) / 2 (seviye 2: 100, seviye 3: 300, seviye 4: 600). Yani n'den n+1'e geçiş n × 100 ek XP gerektirir ve XP seviye atlayınca sıfırlanmaz. Eşik aşıldığında seviye otomatik yükselir; formül yapılandırılabilir olmalı, değişirse mevcut seviyeler yeniden hesaplanır (CR-004). | M |
| FR-GAM-03 | Tüm XP/puan değişiklikleri yalnızca eklenebilen, güncellenemeyen ve silinemeyen bir hareket kaydında (ledger) tutulmalıdır. Düzeltmeler yalnızca ters kayıtla yapılır. | M |
| FR-GAM-04 | Aynı yorum için aynı tür ödül iki kez verilmemelidir (idempotent işleme). | M |
| FR-GAM-05 | Seviye atlama gerçekleştiğinde bu bilgi mobil istemciye iletilebilmelidir. | S |
| FR-GAM-06 | Yorumun durumu (analiz ediliyor / geçerli / geçersiz) ve kazanılan ödül istemci tarafından sorgulanabilmelidir. | M |
| FR-GAM-07 | Sonradan hile tespit edilen bir yorumun ödülü ters kayıtla geri alınabilmelidir. Geri alma bakiyeyi negatife düşürürse hesap işaretlenir. | M |
| FR-GAM-08 | Puanlara son kullanma tarihi tanımlanabilmesi için ledger kayıtları kazanım tarihini taşımalıdır (politika: S-16). | S |

### 5.5 B2B Dashboard API

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-B2B-01 | Markalar OAuth2 client credentials akışıyla kimlik doğrulamalıdır. Bir markanın birden fazla istemci kimliği olabilmeli (kesintisiz anahtar rotasyonu için), her kimliğin kapsamı (scope) ve son kullanma tarihi olmalıdır. Marka yalnızca kendi verisini görür. | M |
| FR-B2B-02 | Marka, şubelerini listeleyebilmelidir. | M |
| FR-B2B-03 | Marka, yorumları şube, tarih aralığı, duygu ve konuya göre filtreleyip imleç (cursor) tabanlı sayfalama ile listeleyebilmelidir. | M |
| FR-B2B-04 | Marka, şube bazlı özet (duygu dağılımı, en sık konular, şikayet sayısı) alabilmelidir. Şikayet = duygusu "Hayal kırıklığı" veya "Öfkeli" olan geçerli yorum. | M |
| FR-B2B-05 | Isı haritası için şube koordinatlarıyla eşleşmiş yorum/şikayet yoğunluğu verisi sunulmalıdır. | M |
| FR-B2B-06 | Son kullanıcıyı tanımlayan hiçbir veri (kullanıcı kimliği, cihaz anahtarı vb.) B2B yanıtlarında yer almamalıdır. | M |
| FR-B2B-07 | B2B yanıtlarında yorum metni yalnızca maskelenmiş haliyle yer almalıdır; spam sayılan yorumlar listelere, özetlere ve ısı haritasına dahil edilmemelidir. | M |
| FR-B2B-08 | Bir marka başka bir markaya ait bir kaynağı istediğinde 404 yanıtı dönmelidir; kaynağın varlığı sızdırılmaz. | M |
| FR-B2B-09 | Her B2B erişimi (istemci, uç nokta, zaman, dönen kayıt sayısı) denetim kaydına yazılmalıdır. | S |
| FR-B2B-10 | Tarih aralıkları ISO 8601 biçiminde ve saat dilimiyle birlikte verilir; saat dilimi belirtilmezse Europe/Istanbul kabul edilir. Günlük özetler İstanbul saatine göre günlere bölünür. Veri UTC olarak saklanır (CR-004). | M |

### 5.6 Gizlilik (KVKK)

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-PRIV-01 | Uygulama ilk açılışta aydınlatma metnini göstermeli ve hukuki değerlendirme gerektiriyorsa açık rıza almalıdır. Metin ve rızanın gerekip gerekmediği müşterinin hukuk danışmanınca belirlenir (S-13). | M |
| FR-PRIV-02 | Kullanıcı uygulama içinden verilerinin silinmesini talep edebilmelidir. Talep, cihaz anahtarıyla doğrulanır; ham metin silinir, yorumlar ve ledger kayıtları kullanıcıyla bağı koparılarak anonimleştirilir. | M |
| FR-PRIV-03 | Ham metin 2 yıl saklanıp silinmelidir. Maskelenmiş metin ve analiz sonuçları 2 yılın sonunda yorum düzeyinde silinip yalnızca toplu istatistik olarak tutulmalıdır (ekip önerisi; S-14). | M |

## 6. User Story'ler ve Kabul Kriterleri

**US-01 – Kayıtsız başlangıç**
Bir müşteri olarak, uygulamayı açtığımda form doldurmadan puan biriktirmeye başlamak istiyorum.

- Verilen: cihaz ilk kez açılıyor ve platform doğrulaması başarılı. O zaman: yeni kullanıcı + cüzdan oluşur, en fazla 15 dakika geçerli bir erişim token'ı döner.
- Verilen: aynı cihaz anahtarı tekrar oturum açıyor. O zaman: aynı kullanıcı ve mevcut bakiye döner, yeni kayıt açılmaz.
- Verilen: platform doğrulaması başarısız (emülatör, değiştirilmiş uygulama). O zaman: hesap düşük güven modunda açılır ve kullanıcıya ödül kazanamayacağı bildirilir.
- Verilen: iptal edilmiş bir anahtarla oturum açma denemesi. O zaman: istek reddedilir.

**US-02 – QR ile geri bildirim**
Bir müşteri olarak, şubedeki QR'ı okutup deneyimimi yazmak ve karşılığında XP kazanmak istiyorum.

- Verilen: geçerli QR token'ı + 20–1.000 karakterlik yorum + geçerli platform kanıtı. O zaman: yorum kaydedilir ve yanıt AI analizini beklemeden "analiz ediliyor" durumuyla döner (NFR-PERF-01).
- Verilen: AI yorumu "geçerli" işaretler. O zaman: kullanıcı 10 XP ve 5 puan kazanır; bu şubede bir sonraki ödül, bu yorumun gönderiminden 24 saat sonra mümkün olur.
- Verilen: AI yorumu "spam" işaretler. O zaman: ödül verilmez, ödül hakkı serbest kalır; kullanıcıya daha açıklayıcı yazmasını öneren bir mesaj gösterilir.
- Verilen: kullanıcının bu şubedeki önceki yorumu hâlâ inceleniyor. O zaman: yeni yorum `FEEDBACK_PENDING` koduyla reddedilir.
- Verilen: kullanıcı bu şubede son 24 saatte ödül almış. O zaman: yeni yorum `REWARD_COOLDOWN` koduyla reddedilir.
- Verilen: kullanıcı bu şubede son 24 saatte 3 deneme yapmış. O zaman: yeni yorum `ATTEMPTS_EXHAUSTED` koduyla reddedilir.
- Verilen: bilinmeyen veya iptal edilmiş QR token'ı. O zaman: istek `QR_INVALID` koduyla reddedilir, deneme loglanır.
- Verilen: 1.000 karakterden uzun yorum. O zaman: istek `TEXT_TOO_LONG` koduyla reddedilir ve LLM'e hiçbir şey gönderilmez.
- Verilen: aynı kullanıcıdan aynı şube için iki eşzamanlı istek. O zaman: yalnızca biri kabul edilir.
- Verilen: ağ zaman aşımı sonrası istemci aynı Idempotency-Key ile isteği tekrarlar. O zaman: yeni yorum oluşmaz, ilk isteğin sonucu döner.
- Verilen: platform kanıtı eksik veya geçersiz. O zaman: yorum kaydedilir ve markanın verisine katkı sağlar, ancak ödül verilmez.

**US-03 – Seviye atlama**
Bir müşteri olarak, yeterli XP topladığımda seviye atladığımı görmek istiyorum.

- Verilen: toplam XP 99'dan 109'a çıkar. O zaman: seviye 1'den 2'ye yükselir ve yorum durumu sorgusunda belirtilir.
- Verilen: toplam XP 299'dan 309'a çıkar. O zaman: seviye 2'den 3'e yükselir.
- Aynı yorum için ödül işlemi tekrarlanırsa XP ikinci kez eklenmez.

**US-04 – Otomatik analiz**
Bir marka yöneticisi olarak, her yorumun duygu ve konusunun otomatik etiketlenmesini istiyorum.

- Yorumların %95'i kayıttan sonra 10 saniye içinde analiz edilir (NFR-PERF-03); duygu ve konu tanımlı etiket kümesindendir.
- LLM erişilemezse yorum kaybolmaz; denemeler 24 saat sürer, bu süre sonunda yorum FR-AI-09'a göre sonuçlanır.
- Etiketleme kalitesi, değerlendirme setinde NFR-AIQ-01 hedeflerini karşılar.

**US-05 – Şube bazlı içgörü**
Bir marka yöneticisi olarak, kendi şubelerimdeki şikayetleri ve özetleri kendi panelimde görmek istiyorum.

- Geçerli OAuth2 erişim token'ı ile yalnızca o markanın verisi döner; başka markanın şube kimliği istenirse 404 döner.
- Yorumlar şube, tarih, duygu ve konuya göre filtrelenir ve imleçle sayfalanır.
- Yanıtlarda son kullanıcıyı tanımlayan veri ve maskelenmemiş metin bulunmaz; spam yorumlar yer almaz.
- Isı haritası uç noktası, her şube için koordinat ve seçilen tarih aralığındaki yorum/şikayet sayısını döner.

**US-06 – Verilerimi silme**
Bir müşteri olarak, uygulama içinden verilerimin silinmesini isteyebilmek istiyorum.

- Verilen: kullanıcı silme talebinde bulunur ve cihaz anahtarıyla doğrulanır. O zaman: ham metinleri silinir, yorumları ve ledger kayıtları kendisiyle bağı koparılarak anonimleştirilir, cihaz anahtarı iptal edilir.

## 7. Fonksiyonel Olmayan Gereksinimler

Sayısal hedefler ekip önerisidir ve müşteri onayı gerektirir (S-6, S-15). Kapasite ve maliyet hesabı SDD Bölüm 8.4'tedir.

| ID | Kategori | Gereksinim |
| --- | --- | --- |
| NFR-SCALE-01 | Ölçeklenebilirlik | API katmanı durumsuz (stateless) olmalı, yatayda çoğaltılabilmelidir. |
| NFR-SCALE-02 | Ölçeklenebilirlik | AI analizi kuyruk üzerinden asenkron çalışmalı, worker sayısı bağımsız artırılabilmelidir. Sistem 12 aylık hedef yükün tepe değerini (SDD 8.4) karşılamalıdır. |
| NFR-PERF-01 | Performans | Yorum gönderme uç noktası, LLM'i beklemeden p95 < 500 ms yanıt vermelidir. |
| NFR-PERF-02 | Performans | Oturum açma uç noktası p95 < 300 ms yanıt vermelidir (platform doğrulama servisine yapılan ilk kayıt çağrısı hariç). |
| NFR-PERF-03 | Performans | Metindeki "anlık" ifadesi gereği yorumların %95'i kayıttan sonra 10 saniye içinde analiz edilmiş olmalıdır. |
| NFR-AVAIL-01 | Erişilebilirlik | Mobil ve B2B API'leri için aylık erişilebilirlik en az %99,5 olmalıdır (planlı bakım hariç). |
| NFR-DR-01 | Felaket kurtarma | Veri kaybı hedefi (RPO) en fazla 5 dakika, hizmete dönüş hedefi (RTO) en fazla 4 saat olmalıdır. Yedekten geri dönüş üç ayda bir test edilmelidir. |
| NFR-SEC-01 | Güvenlik | Tüm trafik TLS 1.2 veya üzeri ile şifrelenmelidir. |
| NFR-SEC-02 | Güvenlik | Sabit QR'ın güvenliği gizliliğe değil tahmin edilemezliğe ve iptal edilebilirliğe dayanır (FR-QR-01). Sonraki fazdaki dinamik QR asimetrik imza ile korunur ve imza anahtarları anahtar yönetim servisinde (KMS) tutulur. |
| NFR-SEC-03 | Güvenlik | B2B istemci sırları veritabanında yalnızca hash'lenmiş olarak saklanmalıdır. |
| NFR-SEC-04 | Güvenlik | LLM'e gönderilen metinde kullanıcıyı tanımlayan veri yer almamalıdır. |
| NFR-SEC-05 | Güvenlik | Uygulama OWASP ASVS Seviye 2 gereksinimlerini hedeflemeli; bağımlılık ve imaj güvenlik taramaları CI'da çalışmalıdır. |
| NFR-SEC-06 | Güvenlik | Gizli anahtarlar ve parolalar yönetilen bir sır deposunda tutulmalı; kaynak koduna, imajlara veya loglara yazılmamalıdır. |
| NFR-DATA-01 | Veri bütünlüğü | Puan/XP işlemleri atomik olmalı; cüzdan bakiyesi her zaman ledger toplamına eşit olmalıdır. |
| NFR-PRIV-01 | Gizlilik / KVKK | Kişisel veri işleme, müşterinin hukuk danışmanınca belirlenecek veri sorumlusu/veri işleyen rollerine ve yurt dışına aktarım dayanağına uygun olmalıdır (S-13). |
| NFR-PRIV-02 | Gizlilik / KVKK | Ham yorum metni ayrı tutulmalı, zarf şifrelemesiyle (KMS) uygulama seviyesinde şifrelenmeli, yalnızca analiz ve yeniden maskeleme süreçlerince okunabilmeli, loglara yazılmamalı ve FR-PRIV-03'e göre silinmelidir. |
| NFR-AIQ-01 | AI kalitesi | Sektör başına en az 300 etiketli Türkçe yorumdan oluşan değerlendirme setinde: duygu için makro-F1 ≥ 0,80, konu için doğruluk ≥ 0,75, "spam" kararında kesinlik (precision) ≥ 0,95. Spam kesinliği en yüksek tutulur, çünkü yanlış spam kararı gerçek kullanıcıyı cezalandırır. |
| NFR-AIQ-02 | AI kalitesi | Canlı analizlerin haftalık %1'lik örneği insan tarafından kontrol edilmeli ve sonuçlar değerlendirme setini büyütmek için kullanılmalıdır. |
| NFR-OBS-01 | Gözlemlenebilirlik | Yapılandırılmış loglar (kişisel veri içermeyen), dağıtık izleme ve temel metrikler (istek sayısı, hata oranı, gecikme, kuyruk uzunluğu, analiz süresi, LLM maliyeti) tutulmalı; erişilebilirlik ve gecikme hedefleri için alarm tanımlanmalıdır. |
| NFR-MAINT-01 | Bakım | API sürümlenmeli (/v1) ve OpenAPI sözleşmesi sunulmalıdır; uygulamanın sözleşmeye uyumu otomatik testle doğrulanmalıdır. |
| NFR-COST-01 | Maliyet | LLM çağrı başına model, token kullanımı ve tahmini maliyet kaydedilmelidir. |
| NFR-COST-02 | Maliyet | Analiz başına maliyet, SDD 8.4'teki kapasite modeline göre izlenmeli; aylık bütçe ile hedef ölçek arasındaki fark müşteriye raporlanmalıdır (S-15). |

## 8. Varsayımlar

| ID | Varsayım |
| --- | --- |
| V-1 | İPTAL (CR-003): Kimlik artık istemcinin beyan ettiği bir cihaz kimliğine değil, doğrulanmış cihaz anahtarına dayanır. |
| V-2 | QR kodları platform tarafından üretilir ve markaya/şubeye fiziksel olarak teslim edilir; markalar kendi QR'ını üretmez. |
| V-3 | İPTAL (S-3): Yorumun geçerliliğine AI karar verir; XP analizden sonra verilir. |
| V-4 | MVP'de marka, şube, QR ve B2B istemci tanımları bir seed/yönetim script'iyle yapılır; yönetim paneli yoktur. |
| V-5 | MVP tek dil (Türkçe) yorumları hedefler. |
| V-6 | Başlangıç değerleri: XP 0, puan 0, seviye 1. |
| V-7 | İPTAL (CR-003): B2B kimlik doğrulama tek API anahtarı yerine OAuth2 client credentials ile yapılır. |
| V-8 | "Isı haritası", şube koordinatları üzerinden yorum/şikayet yoğunluğu anlamına gelir. |
| V-9 | Kullanıcıların büyük çoğunluğu App Attest (iOS 14+) veya Play Integrity destekleyen cihaz kullanır; desteklemeyenler düşük güven modunda çalışır. |
| V-10 | Tepe saatlerdeki yük, günlük ortalamanın yaklaşık 10 katıdır (akaryakıt ve kahve sektörlerindeki sabah/akşam yoğunluğu). Pilot verisiyle doğrulanacaktır. |

## 9. Açık Sorular ve Ekip Önerileri

### 9.1 İlk Analizde Sorulan Sorular ve Ekip Önerileri

Aşağıdaki öneriler ekibin orijinal metne dayanarak hazırladığı yanıtlardır; her biri müşteri doğrulaması bekler.

| Soru | Ekip önerisi | Etkilenen gereksinimler |
| --- | --- | --- |
| S-1 Kapsam: MVP içi / dışı ayrım uygun mu? | Bölüm 4'teki ayrım. Isı haritası verisi MVP'ye dahildir, çünkü metin B2B örneği olarak ısı haritasını açıkça sayıyor; görselleştirme markanın panelindedir. | FR-B2B-05 |
| S-2 QR modeli: tek kullanımlık mı, sabit mi? | MVP'de şubeye özel, tahmin edilemez token'lı sabit QR; aynı kullanıcı aynı şubede 24 saatte en fazla 1 ödül. Metindeki "daha önce kullanılıp kullanılmadığı" ifadesi tek kullanımlık QR'ı da işaret edebilir; bu yüzden müşteriyle ilk doğrulanacak konudur. Dinamik QR'a geçiş tasarımca desteklenir. | FR-QR-01..10 |
| S-3 Geçerli yorum nedir? | 20–1.000 karakter; anlamsız/spam metin AI tarafından ayıklanır; XP, AI "geçerli" dedikten sonra verilir. | FR-AI-01, FR-AI-08, FR-GAM-01 |
| S-4 Etiketler | Duygu sabit: Mutlu, Memnun, Nötr, Hayal kırıklığı, Öfkeli. Konu sektöre göre: Akaryakıt: Tuvalet temizliği, Personel tutumu, Bekleme süresi, Fiyat, Market ürünleri, Pompa/ekipman. Kahve: Lezzet, Personel tutumu, Bekleme süresi, Fiyat, Temizlik, Ortam. Listeler güncellenebilir ve sürümlüdür. | FR-AI-04 |
| S-5 Ekonomi | Geçerli yorum başına 10 XP ve 5 puan; seviye n'den n+1'e n × 100 XP. XP seviyeyi belirler; puan ileride ödüle çevrilecek, MVP'de yalnızca birikir. | FR-GAM-01, FR-GAM-02 |
| S-6 Ölçek | Pilot: 2 marka, ~50 şube, günde ~2.000 yorum. 12 ay hedefi: 20 marka, ~2.000 şube, günde ~100.000 yorum. | NFR-SCALE, NFR-PERF, NFR-COST-02 |
| S-7 LLM | MVP'de OpenAI veya Anthropic; seçim değerlendirme setiyle yapılır (CR-006, SDD ADR-018). Başka sağlayıcıya geçebilmek için soyutlama. MVP aylık LLM bütçesi 300 USD (12 aylık hedefle uyumu: S-15). | FR-AI-06, FR-AI-12 |
| S-8 KVKK | Yorumlar 2 yıl saklanır; kişisel veriler maskelenerek yurt dışındaki LLM'e gönderilebilir. Hukuki dayanak S-13'te sorulur. | FR-AI-07, FR-PRIV-03 |
| S-9 Hesap kurtarma | MVP'de cihaz değişince cüzdanın kaybolması kabul edilir; telefon numarasıyla bağlama ilk sonraki faz önceliğidir. | Bölüm 4 |
| S-10 Altyapı | AWS, Frankfurt bölgesi; Docker; kod müşterinin GitHub organizasyonunda; staging ortamı. | SDD Bölüm 9 |

### 9.2 Tasarım Sırasında Sorulan Sorular ve Ekip Önerileri

| Soru | Ekip önerisi | Etkilenen gereksinimler |
| --- | --- | --- |
| S-11 Sahte cihaz ve hesap riski | Kimlik, platform tarafından doğrulanmış cihaz anahtarına dayanır (CR-003); doğrulanamayan cihazlar düşük güven modunda ödül kazanamaz. Telefon doğrulaması sonraki fazdadır. | FR-AUTH-01..08 |
| S-12 AI başarısızlığı | Kullanıcı teknik hatamız yüzünden ödülünü kaybetmemeli ve kilitli kalmamalıdır: 24 saat içinde analiz edilemeyen yorum her durumda kapatılır; gönderimde ödüle uygunsa ve bütçe koruması devrede değilse ödüllendirilir (CR-007). | FR-AI-09 |

### 9.3 Müşterinin Yanıtlaması Gereken Açık Sorular

Bu soruların ekip önerisi yoktur; yanıtlar hukuki, ticari veya operasyonel karar gerektirir.

- [ ] **S-13 KVKK rolleri ve aktarım:** Kişisel veriler bakımından platform mı, marka mı veri sorumlusudur? Yurt dışındaki LLM sağlayıcısına aktarımın hukuki dayanağı nedir ve sağlayıcıyla bir veri işleme sözleşmesi yapılacak mı? Uygulamada açık rıza gerekiyor mu? (Hukuk danışmanınız tarafından.)
- [ ] **S-14 Saklama:** Maskelenmiş metin ve analizlerin 2 yıl sonra yorum düzeyinde silinip yalnızca toplu istatistik olarak tutulması uygun mu?
- [ ] **S-15 LLM bütçesi ve ölçek:** Aylık 300 USD bütçe pilot için yeterlidir; 12 aylık hedefte (günde 100.000 yorum) yetersiz kalması beklenir (SDD 8.4). Bütçe ölçekle birlikte artacak mı, yoksa maliyet hedefi mi belirlenmeli?
- [ ] **S-16 Puan politikası:** Puanların son kullanma süresi olacak mı? Hile sonrası geri alınan puan bakiyeyi negatife düşürürse ne yapılmalı?
- [ ] **S-17 Platform hesapları:** Apple Developer hesabında App Attest ve Google Cloud'da Play Integrity kurulumunu sizin ekibiniz mi yapacak? Play Integrity'nin günlük kotası hedef ölçekte artırılmalıdır.
- [ ] **S-18 Erişilebilirlik:** %99,5 erişilebilirlik, 5 dakika RPO ve 4 saat RTO hedefleri ticari beklentinizle uyumlu mu?
- [ ] **S-19 B2B entegrasyonu:** Markaların sistemleri OAuth2 client credentials ile entegre olabilir mi?
- [ ] **S-20 Veritabanı standardı:** Şirketinizde bir veritabanı standardı var mı (PostgreSQL, MySQL, SQL Server, MongoDB)?
- [ ] **S-21 Alan adı ve uygulama bağlantıları:** QR'larda hangi alan adı kullanılacak? QR, sistem kamerasıyla okutulduğunda uygulamayı açmalı (universal link / app link); uygulama yüklü değilse mağaza sayfasına mı yönlendirilmeli? Demo için geçici bir alan adı kullanılır.

## 10. Sözlük

| Terim | Anlam |
| --- | --- |
| Lazy Auth | Kullanıcıdan bilgi istemeden, arka planda oluşturulan anonim oturum |
| Gölge Cüzdan | Anonim kullanıcıya bağlı XP/puan hesabı |
| Cihaz anahtarı | Telefonun güvenli donanımında üretilen, dışarı aktarılamayan ve platform tarafından doğrulanan kimlik anahtarı |
| Attestation | Apple veya Google'ın, bir anahtarın değiştirilmemiş uygulamamıza ve gerçek bir cihaza ait olduğunu onaylaması |
| Düşük güven modu | Doğrulanamayan cihazların yorum yazabildiği ama ödül kazanamadığı çalışma modu |
| Double-Spending | Aynı QR'ın birden fazla kez ödül kazandırmak için kullanılması |
| Ledger | Bakiyeyi oluşturan, yalnızca eklenebilen XP/puan hareket kayıtları |
| Ters kayıt | Bir ledger kaydını silmek yerine etkisini geri alan yeni kayıt |
| XP | Seviye atlamayı belirleyen deneyim puanı |
| Puan | Kullanıcının biriktirdiği, ileride ödüle çevrilecek sadakat puanı |
| Şube | Bir markanın QR koduyla temsil edilen fiziksel noktası |
| RPO / RTO | Kabul edilebilir en fazla veri kaybı süresi / hizmete dönüş süresi |

## 11. Gözden Geçirme, İzlenebilirlik ve Onay

v1.3 itibarıyla doküman 51 fonksiyonel (45 zorunlu, 6 ertelenebilir) ve 22 fonksiyonel olmayan gereksinim, 6 user story, 12 ekip önerisi ve 9 açık soru içerir. Ekip önerileri ve açık sorular müşteri doğrulamasıyla kesinleşecektir.

### 11.1 İzlenebilirlik Matrisi

Orijinal müşteri metnindeki her ifade en az bir gereksinime bağlanmıştır.

| Orijinal metindeki ifade (özet) | Gereksinimler | User story |
| --- | --- | --- |
| Fiziksel noktalardaki belirli QR kodları okutulur | FR-QR-01, FR-QR-02 | US-02 |
| Uzun form olmadan, Device ID ile isimsiz puan cüzdanı | FR-AUTH-01..08 | US-01 |
| QR'ın daha önce kullanılıp kullanılmadığı ve sahte olup olmadığı denetlenir | FR-QR-01..10 | US-02 |
| Yorumlar anlık olarak LLM'e (OpenAI/Gemini vb.) gönderilir, yapılandırılmış sonuç kaydedilir | FR-AI-01..12, NFR-PERF-03, NFR-AIQ-01..02 | US-04 |
| Her geçerli yorumla XP ve puan birikir | FR-GAM-01, FR-AI-08, FR-AI-09 | US-02, US-03 |
| XP artışı ve Level Up'ı yöneten arka plan sistemi | FR-GAM-01..08, NFR-SCALE-02 | US-03 |
| Markalara şube bazlı şikayetler ve ısı haritaları sunan REST API | FR-B2B-01..10, NFR-MAINT-01 | US-05 |
| Sağlam ve ölçeklenebilir backend | NFR-SCALE-01..02, NFR-PERF-01..03, NFR-AVAIL-01, NFR-DR-01, NFR-DATA-01 | – |
| Mobil taraf Flutter ile ilerliyor | NFR-MAINT-01 (OpenAPI sözleşmesi), Bölüm 4 kapsam dışı | – |
| Temel özellikler MVP'de, diğerleri sonra | Bölüm 4 Kapsam | – |

Metinde doğrudan karşılığı olmayan, mühendislik, güvenlik veya hukuk gerekçesiyle eklenen gereksinimler: FR-QR-05, FR-QR-06, FR-QR-10, FR-AUTH-06..08, FR-AI-07, FR-AI-10..12, FR-GAM-07..08, FR-B2B-06..10, FR-PRIV-01..03, NFR-SEC-01..06, NFR-PRIV-01..02, NFR-AIQ-01..02, NFR-OBS-01, NFR-COST-01..02, NFR-AVAIL-01, NFR-DR-01. Bunlar müşteri isteği değil, ekibin önerisidir.

### 11.2 Gözden Geçirme Sonucu

| Kriter | Sonuç |
| --- | --- |
| Metne izlenebilirlik | Tamam: metindeki tüm modüller ve ifadeler eşlendi (11.1). |
| Tutarlılık | Tamam: V-3 / S-3, sabit QR / FR-QR-04 ve 24 saat penceresi / FR-QR-07 çelişkileri giderildi. |
| Test edilebilirlik | Tamam: kabul kriterleri ölçülebilir; test eşlemesi Test Stratejisi dokümanındadır. |
| Tanımların netliği | Tamam: "geçerli yorum", "şikayet", "çift kullanım", "24 saat" tanımlandı. |
| Güvenlik | Tamam: gereksinimler Tehdit Modeli'ndeki tehditlere karşılık gelecek şekilde gözden geçirildi. |
| Açık sorular | 9 soru (S-13..S-21) müşteri yanıtı bekliyor. |

### 11.3 Müşteri Doğrulama Listesi

Demo sunumunda "biz şöyle önerdik, doğru mu?" kalıbıyla sorulacak ekip önerileri. Bunlardan biri değişirse ilgili gereksinimler değişiklik talebiyle güncellenir. Bölüm 9.3'teki açık sorular bu listeye ek olarak sorulur.

1. QR: Şubeye özel sabit QR ve kullanıcı başına 24 saatte bir ödül (S-2). Alternatif: fişe basılan tek kullanımlık QR.
2. Kimlik: Platform tarafından doğrulanmış cihaz anahtarı; doğrulanamayan cihazlar ödül kazanamaz (S-11).
3. XP, AI geçerli dedikten sonra birkaç saniye içinde verilir (S-3).
4. Mobil uygulamanın bağlı olduğu mevcut backend/mock ve API sözleşmesini bizim önermemiz.
5. Markaların kendi panelleri var; biz yalnızca API sağlıyoruz.
6. Kişisel veriler maskelenerek yurt dışındaki LLM'e gönderilir (S-8, S-13).
7. Puan MVP'de yalnızca birikir; ödüle dönüşümü ve sorumlusu sonraki fazda belirlenir (S-5).
8. Spam sayılan yorum ödül hakkını yakmaz; şube başına 24 saatte en fazla 3 deneme (FR-QR-09).
9. Markalar yorumların yalnızca maskelenmiş halini görür: telefon, e-posta, plaka, T.C. kimlik numarası, IBAN ve kart numarası maskelenir. Çalışan ve müşteri isimleri MVP'de maskelenmez; bu yüzden bir yorumdaki isim markaya ulaşabilir (bilinen sınır, SDD TZ-8; Türkçe isim tanıma sonraki fazdadır) (FR-B2B-07, FR-AI-07; CR-007).
10. Ham metin şifreli saklanır ve 2 yıl sonra silinir (FR-PRIV-03, NFR-PRIV-02).
11. AI kalite hedefleri (NFR-AIQ-01) ve haftalık insan kontrolü (NFR-AIQ-02).
12. Seviye formülü: XP seviye atlayınca sıfırlanmaz; seviye 2 için 100, seviye 3 için 300 toplam XP (FR-GAM-02).
13. B2B tarih aralıkları ve günlük özetler İstanbul saatine göre (FR-B2B-10).
14. LLM sağlayıcısı OpenAI veya Anthropic olabilir; yurt dışı aktarım (KVKK) değerlendirmesi seçilen sağlayıcıyı kapsamalıdır (S-7, CR-006).
15. 24 saat içinde analiz edilemeyen yorum her durumda "analiz edilemedi" olarak kapatılır ve kullanıcının o şubedeki kilidi açılır; ödül yalnızca yorum gönderimde ödüle uygunsa (normal güven ve geçerli platform kanıtı) ve bütçe koruması devrede değilse verilir (FR-AI-09, FR-AI-12; CR-007).

### 11.4 Değişiklik Yönetimi

v1.0 baseline'dan sonra her değişiklik bir değişiklik talebiyle yapılır:

1. Talep, etkilenen gereksinim ID'lerini ve gerekçesini içerir.
2. Ekip, kapsam ve süre etkisini değerlendirir.
3. İki taraf onaylarsa doküman v1.x olarak güncellenir.

### 11.5 Onay Kaydı

| Rol | Taraf | Durum | Tarih |
| --- | --- | --- | --- |
| Geliştirme ekibi | Murat Çay | Hazırlandı | 9 Ekim 2026 |
| Proje sahibi | Müşteri | Doğrulama bekliyor (demo sunumunda) | – |

## 12. Değişiklik Talepleri

### CR-001 – Sahte cihaz ve QR yayılması riskleri

| Alan | Değer |
| --- | --- |
| Kaynak | Tasarım aşaması, Yazılım Tasarım Dokümanı TZ-1 ve TZ-2 |
| Durum | Kısmen çözüldü: sahte cihaz riski CR-003 ile kapatıldı; QR yayılması riski müşteri kararı bekliyor |
| Etkilenen gereksinimler | FR-AUTH-01..08, FR-QR-01..10, FR-B2B-03/04 |

**Tespit:** "Sabit QR + istemcinin beyan ettiği cihaz kimliği" modeli iki risk taşıyordu:

1. Cihaz kimliği istemci tarafından beyan edildiği için bir script sınırsız cüzdan açıp 24 saat kuralını aşabiliyordu. **Çözüm:** CR-003 ile kimlik, platform tarafından doğrulanmış cihaz anahtarına taşındı (önceki B seçeneği MVP'ye alındı).
2. Sabit QR'ın fotoğrafı paylaşılırsa şubeye hiç gitmemiş kişiler yorum yazabilir. Bu yalnızca puan kaybı değil, markalara sunulan şube verisinin kirlenmesi anlamına gelir.

**QR yayılması için seçenekler:**

| Seçenek | Açıklama | MVP etkisi |
| --- | --- | --- |
| A – İzle ve müdahale et | Şube bazlı anomali tespiti; yayıldığı anlaşılan QR'ın iptal edilip yeniden basılması (FR-QR-01). | Ek donanım gerektirmez; tespit sonrası müdahaleye dayanır. |
| C – Periyodik değişen QR | Şubedeki ekranda belirli aralıklarla değişen, imzalı QR. | Şubede ekran gerektirir; fotoğraf paylaşımını etkisizleştirir. |
| D – Fişe basılan tek kullanımlık QR | Her alışverişte kasa sisteminin ürettiği imzalı, süreli QR. | Kasa entegrasyonu gerektirir; en güçlü koruma. |

**Ekip önerisi:** MVP'de A; C veya D, sahadaki donanıma ve kasa entegrasyonuna bağlı olduğu için müşterinin operasyonel kararıdır.

### CR-002 – Ödül hakkı, idempotency ve KVKK netleştirmeleri

| Alan | Değer |
| --- | --- |
| Kaynak | Tasarım aşaması, veri modeli çalışması |
| Durum | Ekip önerisi; müşteri doğrulaması bekliyor (11.3, madde 8–10) |
| Değişen gereksinimler | FR-QR-07, US-02 |
| Yeni gereksinimler | FR-QR-09, FR-AI-10, FR-B2B-07, NFR-PRIV-02 |

**Gerekçe:**

1. **Ödül hakkı ve spam:** Yapay zeka yanılabilir; gerçek ama kısa bir şikayet spam sayılırsa kullanıcının 24 saat beklemesi hem kullanıcıyı hem markanın en değerli verisini kaybettirir. Öte yandan sınırsız deneme, AI'ın deneme–yanılmayla kandırılmasına (prompt injection) kapı açar. Karar: spam ödül hakkını tüketmez, deneme sayısı 24 saatte 3 ile sınırlıdır; bir yorum incelenirken aynı şubeye yeni yorum gönderilemez.
2. **Idempotency:** Mobil istemci ağ zaman aşımı sonrası isteği tekrarladığında kullanıcı hatalı biçimde reddediliyordu. Idempotency-Key ile tekrar eden istek ilk sonucu döner.
3. **Maskelenmiş metin:** Markalar çalışan isimlerini görmez; KVKK riski azalır. Bedeli, markanın şikayeti belirli bir çalışanla ilişkilendirememesidir. *(CR-007 ile düzeltildi: isimler MVP'de maskelenmez; yalnızca desenle yakalanan kişisel veriler maskelenir.)*
4. **Ham metin:** Maskeleme algoritmasının sonradan iyileştirilebilmesi için saklanır, ancak şifreli, erişimi kısıtlı ve süreli olarak.

### CR-003 – Güvenlik, kalite ve operasyon gereksinimlerinin profesyonelleştirilmesi

| Alan | Değer |
| --- | --- |
| Kaynak | Tüm dokümanların kapsamlı gözden geçirmesi ve tehdit modeli (`03`) |
| Durum | Ekip önerisi; müşteri doğrulaması bekliyor (11.3, madde 2 ve 11; 9.3) |
| Değişen gereksinimler | FR-AUTH-01..06, FR-QR-01, FR-QR-02, FR-QR-06, FR-QR-07, FR-AI-01, FR-AI-09, FR-GAM-02, FR-GAM-03, FR-B2B-01, FR-B2B-03, FR-B2B-06, NFR-SEC-01..03, NFR-PRIV-01..02, NFR-OBS-01, NFR-MAINT-01, US-01, US-02, US-04, US-05 |
| Yeni gereksinimler | FR-AUTH-07, FR-AUTH-08, FR-QR-10, FR-AI-11, FR-AI-12, FR-GAM-07, FR-GAM-08, FR-B2B-08, FR-B2B-09, FR-PRIV-01..03, NFR-AVAIL-01, NFR-DR-01, NFR-SEC-05, NFR-SEC-06, NFR-AIQ-01, NFR-AIQ-02, NFR-COST-02, US-06 |
| İptal edilen varsayımlar | V-1, V-7 |

**Gerekçe:**

1. **Kimlik:** İstemcinin beyan ettiği cihaz kimliği ve paylaşılan sır, kopyalanabilir veriye dayandığı için hesap ele geçirmeye ve sahte hesap üretmeye açıktı. Kimlik, donanıma bağlı ve platform tarafından doğrulanan anahtara taşındı; ödül kazandıran istek ayrıca platform kanıtı taşır.
2. **Hız sınırları:** IP bazlı sınırlar mobil operatör ağlarında gerçek kullanıcıları cezalandırıp saldırganı durdurmuyordu; sınırlar doğrulanmış kimliğe bağlandı.
3. **QR:** Sabit QR'ı imzalamak fotoğraflanan QR'a karşı koruma sağlamıyordu; güvenlik tahmin edilemez token ve iptal edilebilirliğe dayandırıldı.
4. **Maliyet saldırısı:** Yorum uzunluğuna üst sınır yoktu; 1.000 karakter ve 8 KB sınırı getirildi.
5. **AI kalitesi:** Ödül ve markaya sunulan veri LLM kararına dayandığı halde kalite ölçütü yoktu; değerlendirme seti, hedefler ve insan kontrolü eklendi.
6. **Operasyon:** Erişilebilirlik, felaket kurtarma ve maliyet hedefleri tanımsızdı.
7. **B2B:** Tek API anahtarı kesintisiz rotasyona ve kapsam kısıtlamasına izin vermiyordu; OAuth2 client credentials'a geçildi.
8. **KVKK ve puan:** Silme hakkı, saklama süreleri, ödül iadesi ve puanın son kullanma politikası tanımsızdı.

### CR-004 – Tasarım eksiklerinin giderilmesi

| Alan | Değer |
| --- | --- |
| Kaynak | Demo akışının adım adım gözden geçirilmesi |
| Durum | Ekip önerisi; müşteri doğrulaması bekliyor (11.3, madde 12–13; S-21) |
| Değişen gereksinimler | FR-QR-09, FR-GAM-02, US-02, US-03 |
| Yeni gereksinimler | FR-B2B-10 |
| Yeni açık sorular | S-21 |

**Gerekçe:**

1. **Deneme sınırı:** "24 saatlik deneme penceresi" ifadesi pencerenin sınırında art arda 6 denemeye izin veren bir uygulamaya yol açıyordu. Kural "herhangi bir 24 saatlik aralıkta en fazla 3" olarak netleştirildi.
2. **Seviye formülü:** "n'den n+1'e n × 100 XP" ifadesi hem toplam XP hem de her seviyede sıfırdan sayma olarak okunabiliyordu. Toplam XP yorumu seçildi ve sınır değerleri kabul kriterlerine yazıldı.
3. **Saat dilimi:** Veri UTC saklanırken markanın "bugün" ile İstanbul saatini kastetmesi, günlük özetlerde farklı sonuçlara yol açıyordu.
4. **QR alan adı:** QR bağlantısının alan adı ve uygulamayı açma davranışı tanımsızdı.

### CR-005 – API sözleşmesi gözden geçirmesinden doğan netleştirmeler

| Alan | Değer |
| --- | --- |
| Kaynak | API sözleşmesinin (`docs/api/openapi.yaml`) gözden geçirilmesi |
| Durum | Ekip kararı |
| Değişen gereksinimler | FR-AI-05, FR-QR-06, US-04 |

**Gerekçe:**

1. **FR-AI-05 ile FR-AI-09 çelişiyordu.** FR-AI-05 yeniden denemeler bitince yorumun "başarısız" işaretlenmesini, FR-AI-09 ise 24 saatte analiz edilemeyen yorumun geçerli sayılmasını istiyordu. Denemeler birkaç dakikada tükendiğinde yorum "başarısız" kalıyor, 24 saat kuralı hiç devreye girmiyor ve kullanıcı ödülünü kaybediyordu. Denemeler artık 24 saat sürer ve kullanıcıya görünen bir "başarısız" durumu yoktur.
2. **FR-QR-06 kimlik doğrulama öncesi uç noktaları kapsamıyordu.** Henüz kimliği olmayan isteklerde kimliğe bağlı sınır uygulanamaz; bu uç noktalar için geniş eşikli IP sınırı bilinçli bir istisna olarak tanımlandı.

### CR-006 – LLM sağlayıcı adayları

| Alan | Değer |
| --- | --- |
| Kaynak | Tasarım aşaması, SDD ADR-018 |
| Durum | Ekip önerisi; müşteri doğrulaması bekliyor (11.3 madde 14) |
| Değişen gereksinimler | S-7 |

**Gerekçe:** S-7 MVP için yalnızca OpenAI'ı öngörüyordu. Model seçimi tahminle değil ölçümle yapılacağı için (ADR-018) Anthropic'in küçük modeli de aday olarak eklendi; değerlendirme setinde kalite hedeflerini (NFR-AIQ-01) karşılayan en düşük maliyetli model seçilir. Sağlayıcı değişirse yurt dışı veri aktarımı değerlendirmesi de o sağlayıcı için yapılmalıdır.

### CR-007 – Belirsizliklerin giderilmesi (geliştirme sırasında yapılan gözden geçirme)

| Alan | Değer |
| --- | --- |
| Kaynak | Geliştirme aşaması (S0-07 öncesi), tüm dokümanların ve kodun belirsizlik taraması; kararlar proje tanım metnine (`00-musteri-proje-metni.md`) dayandırıldı |
| Durum | Ekip önerisi; müşteri doğrulaması bekliyor (11.3, madde 9 ve 15) |
| Değişen gereksinimler | FR-AI-09, FR-AI-12, S-12, 11.3 madde 9 ve 15 |

**Gerekçe:**

1. **İsim maskeleme vaadi tasarımla çelişiyordu.** 11.3 madde 9 ve CR-002, çalışan isimlerinin markaya iletilmeyeceğini söylüyordu; oysa FR-AI-07, SDD TZ-8 ve 8.6, isimlerin MVP'de maskelenmediğini (desen tabanlı maskeleme isimleri yakalayamaz) ve Tehdit Modeli T-I5 bunun kabul edilen bir kalan risk olduğunu belirtir. Müşteriye yapılmayan bir şey vaat edilmemesi için madde 9 düzeltildi: desenle yakalanan kişisel veriler maskelenir, isimler maskelenmez. Metindeki "temiz veri" beklentisi isim maskelemenin sonraki fazda eklenmesini gerektirir; ham metin şifreli saklandığı için eski yorumlar o zaman yeniden maskelenebilir.
2. **24 saat kuralı kullanıcıyı kilitleyebiliyordu.** FR-AI-09 bütçe koruması devredeyken otomatik onayı uygulamıyor, FR-AI-12 yeni analizleri kuyrukta bekletiyordu; 24 saati dolan yorum "bekleyen yorum" olarak kalıyor ve kullanıcı o şubeye bütçe sıfırlanana kadar yeni yorum gönderemiyordu. Düşük güvenli yorumun 24 saatte ne olacağı da tanımsızdı ve ödül koşulu yalnızca "normal güven" diyordu; oysa ödül, gönderimdeki platform kanıtına da bağlıdır (FR-QR-10). Metin, XP'nin "her geçerli yorumla" verileceğini söyler ve geçerliliğe yapay zeka karar verir; analiz edilemeyen yorumun ödülü bu yüzden bir ekip önerisidir (S-12). Karar: yorum 24 saatte her durumda kapatılır ve kilit açılır; ödül yalnızca yorum gönderimde ödüle uygunsa ve bütçe koruması devrede değilse verilir. Ön kontrol koşulu kaldırıldı, çünkü ön kontrolden geçemeyen yorum zaten spam sonucu alır.
