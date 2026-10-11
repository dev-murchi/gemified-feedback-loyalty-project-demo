# Geri Bildirim ve Sadakat Motoru – Mühendislik Standartları

11 Ekim 2026 · Murat Çay

## 1. Amaç

Bu doküman, kodun nasıl yazılacağını tanımlar: Clean Architecture katmanları, port–adapter yapısı, taktik DDD kuralları, hata yönetimi, test kuralları ve kalite kapıları. Kuralların mümkün olan her biri CI'da araçla zorlanır; araçla ölçülemeyenler kod inceleme listesindedir (Bölüm 11). Alan modeli Alan Modeli dokümanındadır (`06`).

| Alan | Değer |
| --- | --- |
| Sürüm | 1.3 |
| Dayandığı dokümanlar | SDD v1.1, Alan Modeli v1.0, Test Stratejisi v1.3 |
| Değişiklik (1.1) | Test aracı Jest yerine Vitest: NestJS 12 yalnızca ESM; Vitest ESM'i doğal olarak destekler; dependency-cruiser'a `shared-kernel-is-pure` kuralı eklendi (shared kernel'i her domain dolaylı olarak içe aktarır) |
| Değişiklik (1.2) | `shared-kernel/adapters/` (paylaşılan bellek içi UnitOfWork ve sistem saati) ve `test/support/` (FakeClock) eklendi; dependency-cruiser'a `core-does-not-use-shared-adapters` kuralı eklendi |
| Değişiklik (1.3) | Olay erişim anahtarı (`takeEvents`, `src/shared-kernel/repository-access.ts`) ve `repository-access-only-in-outbound-adapters` kuralı; `InMemoryTable` satırları kopyalar; save sonrası sürüm kuralı (markSaved; uygulama S0-04) |
| Kapsam | `src/` ve `test/` altındaki tüm kod |

**Temel hedefler:**

- Bağımlılıklar yalnızca içe doğrudur: domain hiçbir şeye, application yalnızca domain'e bağımlıdır.
- İş kuralları yalnızca domain'dedir; adapter'lar saklar, çevirir ve taşır, karar vermez.
- Her fonksiyonun cyclomatic complexity değeri **10'dan küçüktür (en fazla 9)**.
- Yüksek cohesion: birlikte değişen kod birlikte durur; her sınıfın tek bir değişme sebebi vardır.

## 2. Katmanlar ve Bağımlılık Kuralı

| Katman | İçerik | Bağımlı olabileceği |
| --- | --- | --- |
| **Domain** | Aggregate'ler, entity'ler, değer nesneleri, domain servisleri, domain olayları, domain hataları | Kendi context'inin domain'i, shared kernel |
| **Application** | Use case'ler, driven port arayüzleri, komut ve sonuç tipleri, olay işleyicileri | Kendi domain ve application katmanı, shared kernel, diğer context'lerin `public` klasörü |
| **Adapters** | Inbound: HTTP controller'ları, kuyruk tüketicileri, zamanlanmış işler. Outbound: PostgreSQL, bellek içi, Redis, LLM, platform doğrulama, şifreleme | Kendi context'inin tüm katmanları, shared kernel, diğer context'lerin `public` klasörü, framework ve kütüphaneler |
| **Composition** | NestJS modülleri, bağımlılık bağlama, yapılandırma | Her şey |

**Framework'ten bağımsızlık:** Domain ve application katmanlarında hiçbir dış paket kullanılmaz: NestJS dekoratörleri, veritabanı sürücüleri, doğrulama kütüphaneleri ve Node.js'in yerleşik modülleri de buna dahildir. Rastgelelik, zaman ve kriptografi gibi yetenekler port üzerinden alınır (`Clock`, `IdGenerator`, `RandomSource`). Use case'ler ve port'lar düz TypeScript sınıfları ve arayüzleridir; NestJS'e composition katmanında, fabrika sağlayıcılarıyla bağlanır.

**Context'ler arası kural:** Bir context, başka bir context'in yalnızca `public` klasörünü kullanabilir. `public` klasörü yayınlanan olayları, open host service arayüzlerini ve bunların tiplerini içerir; aggregate'ler, use case'ler ve adapter'lar asla dışarı açılmaz.

## 3. Klasör Yapısı

```
src/
  shared-kernel/           # tipli kimlikler, Clock, Result, DomainEvent, DomainError, UnitOfWork (port ve tipler)
    adapters/              # paylaşılan bellek içi UnitOfWork ve sistem saati (saf TypeScript)
  identity/
    domain/                # aggregate, entity, değer nesnesi, domain servisi, olay, hata
    application/
      ports/               # driven port arayüzleri
      <use-case>.ts        # her use case kendi dosyasında
    adapters/
      inbound/             # http, kuyruk tüketicisi, zamanlanmış iş
      outbound/            # postgres, memory, redis, llm, attestation, crypto
    public/                # yayınlanan olaylar ve open host service arayüzleri
  catalog/ feedback/ analysis/ gamification/ insights/   # aynı yapı
  composition/             # NestJS modülleri, DI bağlama, yapılandırma
  main.api.ts
  main.worker.ts
test/
  support/                 # FakeClock ve test yardımcıları
  unit/<context>/          # domain ve application testleri
  contract/                # repository sözleşme testleri (bellek içi ve PostgreSQL)
  integration/             # gerçek PostgreSQL ve Redis ile adapter testleri
  e2e/                     # HTTP üzerinden uçtan uca senaryolar
db/migrations/             # SQL göçleri
prompts/                   # sürümlü LLM prompt'ları
```

**Adlandırma:** Dosyalar `kebab-case`; sınıflar ve tipler `PascalCase`; kod tanımlayıcıları yalnızca Alan Modeli'ndeki ortak dilden (`06`, Bölüm 4). Adapter dosyaları teknolojiyi önek alır: `pg-wallet.repository.ts`, `memory-wallet.repository.ts`, `openai.sentiment-analyzer.ts`.

## 4. Taktik DDD Kuralları

**Aggregate'ler**

- Invariant'ları yalnızca aggregate korur. Public setter yoktur; durum yalnızca anlamlı iş metotlarıyla değişir (`reserve`, `complete`, `award`).
- İki fabrika metodu vardır: `create` (yeni nesne, kuralları uygular ve olay üretir) ve `reconstitute` (kalıcı veriden yükleme, olay üretmez).
- Durum değiştiren metotlar ürettikleri domain olaylarını kaydeder; olaylar unit of work tamamlanırken yayınlanır.
- Kaydedilen olayları yalnızca outbound repository adapter'ları alır (`aggregate[takeEvents]()`). Anahtar `src/shared-kernel/repository-access.ts` dosyasındadır; başka bir yerden içe aktarılması dependency-cruiser ile engellenir. Böylece olaylar `save` dışında kaybolamaz.
- Başka aggregate'lere yalnızca kimlikle referans verilir.
- Aggregate'ler küçük tutulur; sınırsız büyüyen koleksiyonlar (örneğin ledger geçmişi) aggregate'e yüklenmez.
- Her aggregate bir `version` taşır; eşzamanlılık iyimser kilitle korunur (ADR-019).

**Değer nesneleri**

- Değişmezdir ve değer eşitliğiyle karşılaştırılır.
- Doğrulama statik `create` metodunda yapılır ve `Result` döner; geçersiz bir değer nesnesi oluşturulamaz.
- İlkel tipler (`string`, `number`) domain sınırında değer nesnesine çevrilir; domain içinde çıplak `string` kimlik ya da metin dolaşmaz.

**Domain servisleri:** Yalnızca tek bir entity'ye ait olmayan kurallar için kullanılır (`PiiMasker`, `LevelPolicy`, `RetryPolicy`). Durum tutmazlar.

**Repository'ler:** Aggregate başına bir repository vardır. Arayüzü application katmanındaki `ports` klasöründedir ve domain nesneleri alıp döner. `save` iyimser kilitle yazar; sürüm uyuşmazsa `ConcurrencyConflict` döner. Bellek içi repository'ler satırları `InMemoryTable` ile saklar; tablo satırları kopyalayarak yazar ve döndürür (`structuredClone`). Satırlar düz veridir (sınıf örneği veya fonksiyon içermez). Bu kural repository sözleşme testleriyle doğrulanır. Başarılı bir `save` sonrasında repository, bellekteki aggregate nesnesinin sürümünü saklanan sürüme eşitler (`aggregate[markSaved](version)`). Unit of work geri alınırsa nesne atılır ve yeniden yüklenir (ADR-019).

**Anemik modele izin verilmez:** Use case'ler akışı yönetir (yükle, aggregate metodunu çağır, kaydet); iş kararı vermez. Use case içinde bir aggregate'in alanına bakarak `if` yazılıyorsa, o kural aggregate'e taşınmalıdır.

## 5. Use Case'ler

- Her use case kendi sınıfıdır ve tek bir `execute(command)` metodu vardır.
- Bağımlılıklar tek bir `deps` nesnesiyle alınır; böylece kurucu parametre sayısı sınırı (Bölüm 8) korunur ve bağımlılıklar adlarıyla okunur.
- Komut ve sonuç tipleri düz verilerdir; framework tipi taşımaz.
- Transaction `UnitOfWork.run(...)` ile açılır. **Dış servis çağrıları (LLM, Apple/Google) transaction içinde yapılmaz.**
- `ConcurrencyConflict` alan use case aggregate'i yeniden yükleyip işlemi bir kez tekrarlar; ikinci çakışmada hatayı yukarı iletir.

```ts
export class SubmitFeedback {
  constructor(private readonly deps: SubmitFeedbackDeps) {}

  async execute(cmd: SubmitFeedbackCommand): Promise<Result<SubmitFeedbackResult, SubmitFeedbackError>> {
    // 1. değer nesnelerini oluştur  2. QR'ı çöz  3. unit of work içinde:
    //    RewardCooldown.reserve → Feedback.create → kaydet (olaylar outbox'a)
  }
}
```

## 6. Hata Yönetimi

| Durum | Nasıl ifade edilir | Örnek |
| --- | --- | --- |
| Beklenen iş sonucu | `Result` ile döner, fırlatılmaz | `RewardCooldown`, `QrInvalid`, `TextTooLong` |
| Eşzamanlılık çakışması | `ConcurrencyConflict` sonucu; use case bir kez yeniden dener | İki eşzamanlı yorum |
| Altyapı hatası | Fırlatılır; inbound adapter `500 INTERNAL_ERROR` döner ve loglar | Veritabanı bağlantısı koptu |
| Programlama hatası | Fırlatılır | Beklenmeyen durum |

- Her domain hatasının bir `code` değeri vardır ve bu değerler API sözleşmesindeki hata kataloğuyla birebir aynıdır.
- Hata kodundan HTTP durumuna eşleme tek bir tabloda, HTTP adapter'ındadır. Bu tablonun sözleşmedeki katalogla aynı olduğu bir testle doğrulanır.
- Biçim doğrulaması (eksik alan, yanlış tip) inbound adapter'da yapılır ve `VALIDATION_ERROR` döner. Anlam doğrulaması (metin uzunluğu, QR geçerliliği) değer nesnelerinde ve aggregate'lerde yapılır ve kendi kodunu döner.
- `null` bir hatayı ifade etmek için kullanılmaz.

## 7. Cyclomatic Complexity ve Cohesion

**Complexity < 10 nasıl korunur:**

- Erken dönüş (guard clause) ile iç içe `if` derinliği azaltılır.
- Uzun `switch`/`if-else` zincirleri yerine tablo (lookup) veya polimorfizm kullanılır. Örnek: hata kodu → HTTP durumu eşlemesi bir tablodur, `switch` değildir.
- Kurallar küçük, adlandırılmış özel fonksiyonlara bölünür: `RewardCooldown.reserve`, `hasPendingFeedback()`, `isInRewardCooldown(now)`, `hasAttemptsLeft(now)` fonksiyonlarını sırayla çağırır.
- `Result` zincirleme yardımcıları (`andThen`, `map`) ardışık hata kontrollerini düzleştirir.
- Testler de aynı sınıra tabidir.

**Cohesion nasıl korunur:** Cohesion için güvenilir bir otomatik ölçü yok; bu yüzden yapı ve inceleme ile korunur.

- Birlikte değişen kod birlikte durur: aggregate, değer nesneleri ve olayları aynı context'in `domain` klasöründe.
- Use case başına bir sınıf; "servis" adı altında ilgisiz metotların toplandığı sınıflar yazılmaz.
- Bir sınıfın her metodu sınıfın alanlarının çoğunu kullanmalıdır; kullanmıyorsa sınıf bölünmelidir (inceleme sorusu).
- Dosya başına bir sınıf ve dosya uzunluğu sınırı (Bölüm 8), cohesion'ı bozan büyümeyi erken gösterir.
- `public` klasörü dar tutulur; bir context dışarıya ne kadar az şey açarsa o kadar cohesive kalır.

## 8. Kalite Kapıları (CI)

Aşağıdaki kapılardan biri başarısız olan değişiklik birleştirilemez.

| Kapı | Araç | Kural |
| --- | --- | --- |
| Tip güvenliği | TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` |
| Complexity | ESLint `complexity` | En fazla 9 (`src/` ve `test/`) |
| Fonksiyon ve dosya boyutu | ESLint | `max-depth` 3, `max-params` 3, `max-lines-per-function` 40, `max-lines` 300, `max-classes-per-file` 1. Test dosyalarında `max-lines-per-function` uygulanmaz, çünkü `describe` blokları doğası gereği uzundur; complexity sınırı testlerde de geçerlidir. |
| Tip kaçağı | typescript-eslint | `no-explicit-any`, `no-non-null-assertion` hata |
| Bağımlılık kuralları | dependency-cruiser | Bölüm 2'deki kurallar ve döngüsel bağımlılık yasağı |
| Biçim | Prettier | Tutarlı biçim; tartışma konusu değil |
| Testler | Vitest | Test Stratejisi'ndeki seviyeler; domain ve application satır kapsamı en az %80 |
| API sözleşmesi | Redocly CLI, sözleşme testi | `openapi.yaml` lint'ten geçer; uygulamanın ürettiği sözleşme bu dosyayla uyumlu |
| Güvenlik | npm audit | Yüksek veya kritik açık yok |

**ESLint yapılandırmasının çekirdeği:**

```js
// eslint.config.mjs (özet)
rules: {
  complexity: ['error', { max: 9 }],
  'max-depth': ['error', 3],
  'max-params': ['error', 3],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-classes-per-file': ['error', 1],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
}
```

**dependency-cruiser kurallarının çekirdeği:**

```js
// .dependency-cruiser.cjs (özet)
forbidden: [
  { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  { name: 'domain-is-pure', severity: 'error',
    from: { path: '^src/([^/]+)/domain/' },
    to: { pathNot: ['^src/$1/domain/', '^src/shared-kernel/'] } },
  { name: 'application-has-no-infrastructure', severity: 'error',
    from: { path: '^src/([^/]+)/application/' },
    to: { pathNot: ['^src/$1/(domain|application)/', '^src/shared-kernel/', '^src/[^/]+/public/'] } },
  { name: 'only-public-across-contexts', severity: 'error',
    from: { path: '^src/([^/]+)/', pathNot: '^src/(composition|shared-kernel)/' },
    to: { path: '^src/[^/]+/', pathNot: ['^src/$1/', '^src/shared-kernel/', '^src/[^/]+/public/'] } },
  { name: 'shared-kernel-is-pure', severity: 'error',
    from: { path: '^src/shared-kernel/' },
    to: { pathNot: '^src/shared-kernel/' } },
  { name: 'core-does-not-use-shared-adapters', severity: 'error',
    from: { path: ['^src/[^/]+/(domain|application)/', '^src/shared-kernel/(?!adapters/)'] },
    to: { path: '^src/shared-kernel/adapters/' } },
  { name: 'repository-access-only-in-outbound-adapters', severity: 'error',
    from: { pathNot: ['^src/shared-kernel/aggregate-root\\.ts$', '^src/[^/]+/adapters/outbound/', '^src/shared-kernel/adapters/'] },
    to: { path: '^src/shared-kernel/repository-access\\.ts$' } },
]
```

`domain-is-pure`, `application-has-no-infrastructure` ve `shared-kernel-is-pure` kuralları `node_modules` ve Node.js yerleşik modüllerini de dışarıda bırakır; domain, application veya shared kernel'e bir kütüphane eklenirse CI kırılır.

## 9. Test Kuralları

Test seviyeleri ve kritik senaryolar Test Stratejisi'ndedir (`04`). Kod yazarken uyulacak kurallar:

- **Domain testleri** saf birim testleridir: veritabanı, framework ve sahte nesne (mock) kullanılmaz.
- **Use case testleri** bellek içi adapter'larla (fake) yazılır; port'lar mock kütüphanesiyle taklit edilmez. Böylece testler davranışı doğrular, uygulama ayrıntısına bağlanmaz.
- **Repository sözleşme testleri** bir kez yazılır; aynı test paketi önce bellek içi, sonra PostgreSQL adapter'ına karşı çalışır (ADR-017).
- Zaman her zaman `FakeClock` ile kontrol edilir; testlerde gerçek saat ve `sleep` kullanılmaz.
- Test verisi builder'larla üretilir; testler birbirinin verisine bağımlı değildir.
- Test adları davranışı anlatır: `rejects a second reward within 24 hours of the last rewarded submission`.
- Her test Given / When / Then düzenindedir.

## 10. Git Akışı

- Trunk tabanlı geliştirme: kısa ömürlü dallar (`feat/S0-06-reward-cooldown`), birleştirmede squash.
- Commit mesajları Conventional Commits biçimindedir (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Her değişiklik bir backlog kalemine bağlıdır (`08-sprint-0-backlog.md`).
- CI yeşil olmadan birleştirme yapılmaz.
- Bir tasarım kararını değiştiren kod, ilgili ADR güncellenmeden birleştirilmez.

## 11. Tamamlanma Tanımı ve Kod İnceleme Listesi

**Tamamlanma tanımı (bir backlog kalemi için):**

- [ ] Kalemin bitiş kriterleri karşılandı.
- [ ] Bölüm 8'deki tüm kalite kapıları geçiyor.
- [ ] İlgili gereksinimlerin testleri yazıldı ve Test Stratejisi'ndeki senaryolarla eşlendi.
- [ ] Davranış API'ye yansıyorsa sözleşme testi geçiyor.
- [ ] Bir karar değiştiyse ilgili ADR veya doküman güncellendi.
- [ ] Kod incelendi.

**Kod inceleme listesi:**

- [ ] İş kuralı yalnızca domain'de mi? Use case'te veya adapter'da karar veren bir `if` var mı?
- [ ] Yeni kod ortak dildeki adları mı kullanıyor?
- [ ] Aggregate dışarıdan değiştirilebiliyor mu (public alan, setter)?
- [ ] Değer nesnesi olması gereken bir ilkel tip dolaşıyor mu?
- [ ] Sınıfın tüm metotları aynı amaca mı hizmet ediyor (cohesion)?
- [ ] Başka bir context'in iç yapısına dokunuluyor mu?
- [ ] Transaction içinde dış servis çağrısı var mı?
- [ ] Hata kodları sözleşmedeki katalogla uyumlu mu?
- [ ] Testler davranışı mı, uygulama ayrıntısını mı doğruluyor?

## 12. Araçlar

| Amaç | Araç |
| --- | --- |
| Çalışma ortamı | Node.js 22 LTS, npm |
| Dil | TypeScript |
| Framework (yalnızca adapter ve composition) | NestJS |
| Test | Vitest, Testcontainers (PostgreSQL, Redis), Supertest |
| Statik analiz | ESLint (typescript-eslint), dependency-cruiser, Prettier |
| HTTP sınırında biçim doğrulaması | Zod (yalnızca inbound adapter'larda) |
| API sözleşmesi | Redocly CLI (lint), Prism (mock sunucu) |
| Kuyruk | BullMQ (ADR-009) |

Sürümler `package-lock.json` ile sabitlenir ve bilinçli olarak güncellenir.
