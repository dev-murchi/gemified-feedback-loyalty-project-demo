# Müşterinin Paylaştığı Proje Metni (Orijinal)

> Bu dosya, proje sahibinin ilk görüşmeden sonra paylaştığı metnin değiştirilmemiş halidir. Tüm gereksinim ve tasarım dokümanları bu metne izlenebilir şekilde bağlanmıştır (bkz. `01-gereksinim-dokumani-SRS.md`, Bölüm 11.1).

---

Fiziksel perakende markaları (akaryakıt istasyonları, kahve zincirleri vb.) için oyunlaştırılmış ve tamamen yapay zeka destekli bir "Geri Bildirim ve Sadakat Motoru" geliştiriyoruz. Müşteriler fiziksel noktalardaki belirli QR kodları okutarak mobil uygulamamız üzerinden deneyimlerini yazıyor. Biz de bu metinleri arka planda AI (NLP) ile analiz edip kurumsal şirketlere anlamlı veriler sunuyoruz. Kullanıcılar ise yaptıkları her geçerli yorumla sistemimizde XP ve puan biriktiriyor.

Şu an mobil tarafın (Flutter) arayüzleri ilerliyor ancak projeyi taşıyacak sağlam ve ölçeklenebilir bir backend mimarisine ihtiyacımız var. Senin uzmanlığınla sistemde kurmayı planladığımız ana modüller şunlar:

**Tembel Kayıt (Lazy Auth) ve Gölge Cüzdan:** Kullanıcı uygulamayı ilk açtığında uzun kayıt formları göstermeden (Device ID ile) arka planda otomatik olarak isimsiz bir puan cüzdanı yaratılması.

**Double-Spending (Çift Kullanım) Güvenliği:** Uygulamadan gelen QR verisinin daha önce kullanılıp kullanılmadığını ve sahte olup olmadığını denetleyen güvenlik kilidi.

**Yapay Zeka (NLP) Köprüsü:** Veritabanına düşen serbest metin yorumlarını anlık olarak LLM (OpenAI/Gemini vb.) API'lerine gönderip, oradan dönen yapılandırılmış veriyi (Duygu: Öfkeli, Konu: Tuvalet temizliği vb.) işleyip kaydetmek.

**Oyunlaştırma (Gamification) Motoru:** Gelen her geçerli veride kullanıcının XP'sini artıracak ve seviye atlama (Level Up) hesaplamalarını yönetecek arka plan sistemi.

**B2B Dashboard API:** Anlaşmalı dev markaların bu verileri kendi yönetim panellerinde (şube bazlı şikayetler, ısı haritaları vb.) görebilmesi için dışarıya temiz veri sunacak REST API uçlarının hazırlanması.

Bunların temel özellikleri MVP'de çalışacak, diğerleri geliştirme aşamasında eklenecek özellikler.
