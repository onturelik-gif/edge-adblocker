# EdgeShield AdBlock

Microsoft Edge (Chromium) için **Manifest V3** mimarisiyle geliştirilmiş hızlı, hafif ve gizlilik odaklı reklam & takipçi engelleyici.

## Özellikler

- **Ağ Seviyesinde Engelleme (`declarativeNetRequest`):** 50 popüler reklam ağı ve 20 takipçi/analitik servisi için yerleşik kurallar.
- **Agresif Mod:** 60 ek agresif ağ kuralı (video reklamları, pop-under, bildirim spamı, çerez/CMP katmanları ve üçüncü parti genel reklam yolları), genişletilmiş kozmetik gizleme ve YouTube otomatik reklam atlama/hızlandırma.
- **Pop-up & Yan Sekme Koruması:** Video oynatıcılara tıklayınca açılan yan reklam sekmelerini (`window.open`, gizli `_blank` tıklamaları, görünmez tıklama katmanları) ve mevcut sekmeyi reklama çevirip 2. sekmeye atan pop-under hilelerini engeller.
- **Anti-Tespit (Stealth) Koruması:** Tuzak reklam betiklerini sertçe engellemek yerine yerel boş stub dosyalarına (`200 OK`) yönlendirir, `offsetHeight === 0` tuzaklarını ekran dışı gizlemeyle atlatır ve anti-adblock JS kontrollerini (`canRunAds`, `blockAdBlock`, `[native code]`) maskeler.
- **Bahis/Banner Temizleyici & Öğe Seçici (Element Picker):** Kendi sunucusundan yüklenen bahis/casino/GIF banner'ları otomatik gizler; ayrıca uBlock tarzı **Öğe Seç & Engelle** aracıyla herhangi bir sayfadaki özel reklam kutusunu tek tıkla kalıcı olarak gizleyebilirsin.
- **Kozmetik Filtreleme:** Sayfa içinde kalan boş reklam kutularını, sponsorlu alanları ve reklam iframe'lerini otomatik gizler.
- **Türkçe Kontrol Paneli:** Genel açma/kapama, site bazlı beyaz liste (whitelist), canlı sayfa ve toplam engelleme sayaçları.
- **Özel Alan Adı Engelleme:** İstediğin herhangi bir alan adını tek tıkla engelleme listesine ekleyip çıkarabilirsin.

## Microsoft Edge Kurulumu

1. Edge adres çubuğuna `edge://extensions` yazıp açın.
2. Sol menüden **Geliştirici modu (Developer mode)** anahtarını etkinleştirin.
3. **Paketlenmemiş öğeyi yükle (Load unpacked)** düğmesine tıklayın ve bu depo klasörünü seçin.

## Proje Yapısı

```text
edge-adblocker/
├── manifest.json          # Manifest V3 yapılandırması
├── background.js          # Dinamik kurallar, whitelist, sayaç ve rozet yönetimi
├── content.js             # Sayfa içi kozmetik filtreleme
├── popup.html / .css / .js# Türkçe kontrol paneli arayüzü
├── rules/
│   ├── ad_rules.json      # Reklam ağı kuralları
│   └── tracker_rules.json # Takipçi/analitik kuralları
└── icons/                 # 16, 32, 48, 128 px eklenti ikonları
```
