# Geri Bildirim ve Sadakat Motoru – Sprint 0 Backlog

11 Ekim 2026 · Murat Çay

## 1. Sprint Hedefi

Demo kapsamındaki (SDD 11.1) beş modülün temel özelliklerini, Mühendislik Standartları'na (`07`) uyan, testli ve gerçek PostgreSQL üzerinde çalışan bir backend olarak müşteriye göstermek.

| Alan | Değer |
| --- | --- |
| Başlangıç | 11 Ekim 2026 (sıfırdan) |
| Zaman kutusu | Demo tarihi proje sahibiyle belirlenir; takım ilk günün sonunda hızını ölçüp kesme çizgisini (Bölüm 4) teyit eder |
| Dayandığı dokümanlar | SDD v1.2 Bölüm 11, Alan Modeli v1.1, Mühendislik Standartları v1.11, Test Stratejisi v1.3 Bölüm 8 |

## 2. Büyüklük ve Öncelik

- **Büyüklük:** S (küçük), M (orta), L (büyük). Göreli büyüklüktür, gün değildir; takım ilk iki kalemden sonra kendi hızını ölçer.
- **Öncelik:** **Must** = demo bu kalem olmadan yapılmaz. **Should** = zaman kalırsa yapılır; yapılmazsa demoda dokümanla anlatılır.

## 3. Kalemler

Kalemler sırayla ele alınır; sıra, Clean Architecture geliştirme sırasını (ADR-017) izler.

S0-06, S0-05'ten önce yapılır (proje sahibi kararı, 11 Ekim 2026): her kullanıcının var olduğu andan itibaren cüzdanı vardır. Kimlik doğrulamaya bağlı parçalar (`/v1/me/wallet`, kullanıcı ve cüzdanın aynı transaction'da oluştuğu test) S0-05'e taşındı. S0-06, yayıncıların olay sözleşmelerini önce yazar (yalnızca tipler, davranış yok): `src/contexts/identity/public/user-registered.ts` (`UserRegistered`) ve `src/contexts/feedback/public/feedback-validated.ts` (`FeedbackValidated`). Gamification bunları oradan içe aktarır; S0-05 ve S0-07 tam olarak bu tipleri yayınlar.

| ID | Kalem | Büyüklük | Öncelik | Bağımlılık |
| --- | --- | --- | --- | --- |
| S0-01 | Proje iskeleti ve kalite kapıları | M | Must | – |
| S0-02 | API sözleşmesinin araçla doğrulanması | S | Must | – |
| S0-03 | Shared kernel | S | Must | S0-01 |
| S0-04 | Catalog context'i | S | Must | S0-03 |
| S0-06 | Gamification context'i | M | Must | S0-03 |
| S0-05 | Identity context'i | L | Must | S0-03, S0-06 |
| S0-07 | Feedback context'i | L | Must | S0-04, S0-05, S0-06 |
| S0-08 | Analysis context'i | L | Must | S0-07 |
| S0-09 | Insights (B2B) context'i | M | Must | S0-07, S0-08 |
| S0-10 | Asenkron altyapı ve Redis | M | Must | S0-08 |
| S0-11 | PostgreSQL adapter'ları | L | Must | S0-04..S0-10 |
| S0-12 | Uçtan uca ve sözleşme testleri | M | Must | S0-11 |
| S0-13 | AI değerlendirme seti ve model seçimi | M | Must | S0-08 |
| S0-14 | Demo verisi ve senaryo script'i | S | Must | S0-12 |
| S0-15 | Müşteri özeti dokümanı | S | Must | S0-14 |

### S0-01 Proje iskeleti ve kalite kapıları

- **İçerik:** npm projesi; TypeScript strict yapılandırması; ESLint, Prettier ve dependency-cruiser kuralları (`07` Bölüm 8); Vitest yapılandırması (unit, contract, integration, e2e); `composition/` ve `test/` iskeleti; context klasörleri her context geliştirilirken oluşturulur (`07` Bölüm 3); GitHub Actions iş akışı; PostgreSQL ve Redis için Docker Compose.
- **Bitiş kriterleri:** Boş iskelette CI yeşil. Complexity değeri 10 olan örnek bir fonksiyon lint'te başarısız oluyor. Domain'den NestJS'e ve bir context'ten başka bir context'in `domain` klasörüne yapılan örnek import'lar dependency-cruiser'da başarısız oluyor. Örnekler doğrulandıktan sonra silinir.

### S0-02 API sözleşmesinin araçla doğrulanması

- **İçerik:** `openapi.yaml` Redocly CLI ile lint'lenir, Prism ile mock sunucu olarak çalıştırılır. Bulunan sorunlar düzeltilir; sözleşme değişirse sürümü artırılır.
- **Bitiş kriterleri:** Lint hatasız. Mock sunucu 12 uç noktanın hepsine sözleşmedeki örneklerle yanıt veriyor. Sözleşme bugüne kadar yalnızca ekibin kendi yazdığı kontrollerle doğrulandığı için bu kalem atlanamaz.

### S0-03 Shared kernel

- **İçerik:** Tipli kimlikler; `Clock` ve `FakeClock`; `Result` ve yardımcıları; `DomainEvent`, `DomainError`, `ConcurrencyConflict`; `UnitOfWork` port'u ve senkron olay dağıtımıyla outbox toplayan bellek içi uygulaması (ADR-020).
- **Bitiş kriterleri:** Bir senkron olay işleyicisi hata verdiğinde unit of work içindeki tüm değişikliklerin geri alındığını gösteren test geçiyor.

### S0-04 Catalog context'i

- **İçerik:** `Brand`, `Branch` + `QrCode`, `LabelSet`, `QrToken`; `QrResolver` ve `LabelSetProvider` open host service'leri; bellek içi repository'ler; demo verisi yükleyicisi; `RevokeQrCode`.
- **Bitiş kriterleri:** FR-QR-01 ve FR-QR-02 testleri; her etiket setinde `other` konusunun bulunduğunu doğrulayan test.

### S0-06 Gamification context'i

- **İçerik:** Yayıncıların olay sözleşmeleri (yalnızca tipler): `src/contexts/identity/public/user-registered.ts`, `src/contexts/feedback/public/feedback-validated.ts`; `Wallet`, ledger kayıtları, `LevelPolicy`; `UserRegistered` ile cüzdan açma (`OpenWallet`), `FeedbackValidated` ile ödül verme (`AwardReward`); `RewardLookup`; `GetWallet` use case'i; olay yönlendirmeleri (`src/composition/event-routes.ts`: `UserRegistered` → `OpenWallet`, `FeedbackValidated` → `AwardReward`).
- **Bitiş kriterleri:** TC-GAM-01, 04, 05; bağlanmış composition üzerinden yayınlanan `UserRegistered` olayının aynı unit of work içinde cüzdan açtığını ve `OpenWallet` başarısız olursa her şeyin geri alındığını gösteren test.

### S0-05 Identity context'i

- **İçerik:** `User` + `DeviceKey`; challenge store (bellek içi); `AttestationVerifier` port'u ve `DevAttestationVerifier` (üretimde açılamaz); `RegisterDevice` (`UserRegistered` yayınlar), `CreateSession`, `AuthenticateRequest`, `PlatformProofVerifier`; ES256 erişim token'ı (adapter); `/v1/auth/*` uç noktaları; `/v1/me/wallet`.
- **Bitiş kriterleri:** TC-AUTH-01, 02, 04, 08, 09; kullanıcı ve cüzdanın aynı transaction'da oluştuğunu gösteren test.

### S0-07 Feedback context'i

- **İçerik:** `FeedbackText`, `IdempotencyKey`, `RequestFingerprint`; `RewardCooldown` aggregate'i (üç kural, sliding log); `Feedback` aggregate'i; yerel `RawTextCipher` adapter'ı (AES-GCM); `SubmitFeedback` (outbox'a `FeedbackSubmitted`), `GetFeedbackStatus`, `ApplyAnalysisResult`, `FinalizeUnanalyzedFeedback`; `/v1/feedbacks` uç noktaları.
- **Bitiş kriterleri:** TC-QR-01..09, TC-API-01, TC-API-02; eşzamanlılık testinin bellek içi adapter'da iyimser kilitle geçmesi.

### S0-08 Analysis context'i

- **İçerik:** `PreChecks`, `PiiMasker` (SDD 8.6), `RetryPolicy`; `FeedbackAnalysis` aggregate'i; `SentimentAnalyzer` port'u, sahte (fake) adapter ve OpenAI adapter'ı; şema ve etiket seti doğrulaması; `ProcessAnalysisJob` (LLM çağrısı transaction dışında); `prompts/feedback-analysis/v1`.
- **Bitiş kriterleri:** TC-AI-01, 02, 03, 06, 09, 10.
- **Should:** Anthropic adapter'ı (ADR-018 adayı).

### S0-09 Insights (B2B) context'i

- **İçerik:** `B2bClient`; `IssueB2bToken` ve kapsamlar; bellek içi `ReportingQueries`; `TimeRange` (Europe/Istanbul), imleç; şube özeti, ısı haritası, konu listesi; kiracı kuralı (404); `/v1/b2b/*` uç noktaları.
- **Bitiş kriterleri:** TC-B2B-01, 02, 03, 07.
- **Should:** B2B denetim kaydı (FR-B2B-09).

### S0-10 Asenkron altyapı ve Redis

- **İçerik:** Outbox aktarıcısı; `JobQueue` port'u ve BullMQ adapter'ı; ayrı worker süreci (`main.worker.ts`); süpürücü zamanlanmış iş (FR-AI-09).
- **Bitiş kriterleri:** API ve worker ayrı süreçlerken bir yorum uçtan uca analiz edilip ödüllendiriliyor.
- **Should:** Redis challenge store'u; GCRA hız sınırlayıcı (ADR-016). Demo tek API süreciyle yapılacağı için bellek içi challenge store yeterlidir.

### S0-11 PostgreSQL adapter'ları

- **İçerik:** ORM ve migration aracı kararı (ADR-017; S-20 yanıtlanmadığı için varsayılan PostgreSQL); SDD 6.1'e göre migration'lar (`version` ve `request_fingerprint` dahil); tüm repository'lerin PostgreSQL adapter'ları; `ReportingQueries`'in SQL karşılığı. Ledger idempotency anahtarının benzersizlik kısıtı adlandırılır (ör. `ledger_entries_idempotency_key_uq`); PostgreSQL adapter'ı yalnızca bu kısıt adını `ConcurrencyConflictError`'a çevirir, başka hiçbir `unique_violation`'ı çevirmez (07 Bölüm 6).
- **Bitiş kriterleri:** Repository sözleşme testlerinin tamamı PostgreSQL'e karşı geçiyor (Testcontainers). TC-QR-01 eşzamanlılık testi gerçek veritabanında geçiyor. ORM kararı ADR olarak kayıtlı.

### S0-12 Uçtan uca ve sözleşme testleri

- **İçerik:** US-01..US-05 için uçtan uca testler; uygulamanın ürettiği OpenAPI ile `openapi.yaml` karşılaştırması; hata kodu → HTTP durumu tablosunun sözleşmedeki katalogla aynı olduğunu doğrulayan test; TC-API-03, TC-API-04.
- **Bitiş kriterleri:** Test Stratejisi Bölüm 8'deki demo alt kümesinin tamamı geçiyor.

### S0-13 AI değerlendirme seti ve model seçimi

- **İçerik:** Sektör başına yaklaşık 50 Türkçe yorum, iki kişi tarafından bağımsız etiketlenir (spam, küfürlü şikayet ve prompt injection örnekleri dahil); değerlendirme script'i; aday modeller üzerinde ölçüm.
- **Bitiş kriterleri:** Sonuçlar kayıtlı; ADR-018 karara bağlandı.

### S0-14 Demo verisi ve senaryo script'i

- **İçerik:** SDD 11.3'teki demo verisi; SDD 11.1'deki senaryoları sırayla çalıştıran script.
- **Bitiş kriterleri:** Script temiz bir veritabanında baştan sona hatasız çalışıyor.

### S0-15 Müşteri özeti dokümanı

- **İçerik:** `docs/05-musteri-ozeti.md`: demo kapsamı, gerçek ve geçici bileşenler, müşterinin karar vermesi gereken konular (SRS 9.3, 11.3, CR-001), LLM bütçesi ve sonraki adımlar.
- **Bitiş kriterleri:** Proje sahibi tarafından gözden geçirildi.

## 4. Kesme Çizgisi

Zaman yetmezse önce **Should** kalemleri düşer: Anthropic adapter'ı, B2B denetim kaydı, Redis challenge store'u, GCRA hız sınırlayıcı.

Hiçbir koşulda düşmeyenler: kalite kapıları (S0-01), sözleşmenin doğrulanması (S0-02), ödül kuralları (S0-07) ve PostgreSQL adapter'ları ile sözleşme testleri (S0-11). Ödül kurallarının bellek içi adapter'da çalışması, müşteriye "çift kullanımı çözdük" demek için yeterli değildir (ADR-017).

## 5. Proje Sahibinden Beklenenler

| Konu | Neden gerekli | Ne zamana kadar |
| --- | --- | --- |
| Demo tarihi | Zaman kutusunu ve kesme çizgisini belirler | Sprint başında |
| OpenAI API anahtarı ve demo bütçesi (Anthropic denenecekse onun da) | S0-08 ve S0-13 gerçek çağrı yapar | S0-08 başlamadan |
| Değerlendirme setini etiketleyecek ikinci kişi | NFR-AIQ-01'deki bağımsız etiketleme | S0-13 başlamadan |

## 6. Riskler

| Risk | Etki | Önlem |
| --- | --- | --- |
| Sıfırdan başlamak demo tarihini kaydırabilir | Demo gecikir | Kesme çizgisi; ilk günün sonunda hız ölçümü |
| Bulut çalışma ortamının npm erişimi yok | Kod orada kurulamaz ve test edilemez | Geliştirme, npm erişimi olan yerel ortamda yapılır |
| Müşterinin veritabanı standardı (S-20) bilinmiyor | PostgreSQL adapter'ları boşa gidebilir | Veritabanı en son bağlanır (ADR-017); ortak sözleşme testleri başka bir adapter'ın maliyetini düşürür |
| Sözleşme ilk kez gerçek araçla doğrulanacak | Flutter ekibine giden sözleşme değişebilir | S0-02 ilk günün işi; değişiklik olursa Flutter ekibine hemen bildirilir |
