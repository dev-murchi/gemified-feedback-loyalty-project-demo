// Hand-written demo catalog (SDD 11.3): 2 fictional brands, 5 branches each in İstanbul, Ankara
// and İzmir, and the SRS S-4 topic lists. Demo only; never loaded in production. Ids and QR tokens
// live in demo-catalog.snapshot.ts, generated once by scripts/generate-demo-catalog.ts.

import type { Sector } from '../../../domain/sector.js';

export interface DemoBrand {
  readonly key: string;
  readonly name: string;
  readonly sector: Sector;
}

export interface DemoBranch {
  readonly key: string;
  readonly brandKey: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

export interface DemoLabelSet {
  readonly sector: Sector;
  readonly labelSetVersion: number;
  readonly topics: readonly { readonly key: string; readonly name: string }[];
}

export interface DemoCatalogDefinition {
  readonly brands: readonly DemoBrand[];
  readonly branches: readonly DemoBranch[];
  readonly labelSets: readonly DemoLabelSet[];
}

export const demoCatalogDefinition: DemoCatalogDefinition = {
  brands: [
    { key: 'fuel', name: 'Örnek Petrol', sector: 'fuel' },
    { key: 'coffee', name: 'Örnek Kahve', sector: 'coffee' },
  ],
  branches: [
    {
      key: 'fuel-ist-kadikoy',
      brandKey: 'fuel',
      name: 'Kadıköy Rıhtım',
      lat: 40.9909,
      lng: 29.0236,
    },
    {
      key: 'fuel-ist-maslak',
      brandKey: 'fuel',
      name: 'Maslak',
      lat: 41.1086,
      lng: 29.0219,
    },
    {
      key: 'fuel-ank-eskisehir-yolu',
      brandKey: 'fuel',
      name: 'Eskişehir Yolu',
      lat: 39.9087,
      lng: 32.7569,
    },
    {
      key: 'fuel-ank-kizilay',
      brandKey: 'fuel',
      name: 'Kızılay',
      lat: 39.9208,
      lng: 32.8541,
    },
    {
      key: 'fuel-izm-bornova',
      brandKey: 'fuel',
      name: 'Bornova',
      lat: 38.4622,
      lng: 27.2163,
    },
    {
      key: 'coffee-ist-besiktas',
      brandKey: 'coffee',
      name: 'Beşiktaş Çarşı',
      lat: 41.043,
      lng: 29.007,
    },
    {
      key: 'coffee-ist-moda',
      brandKey: 'coffee',
      name: 'Moda',
      lat: 40.984,
      lng: 29.026,
    },
    {
      key: 'coffee-ank-tunali',
      brandKey: 'coffee',
      name: 'Tunalı Hilmi',
      lat: 39.905,
      lng: 32.86,
    },
    {
      key: 'coffee-izm-alsancak',
      brandKey: 'coffee',
      name: 'Alsancak',
      lat: 38.437,
      lng: 27.143,
    },
    {
      key: 'coffee-izm-karsiyaka',
      brandKey: 'coffee',
      name: 'Karşıyaka Çarşı',
      lat: 38.456,
      lng: 27.11,
    },
  ],
  labelSets: [
    {
      sector: 'fuel',
      labelSetVersion: 1,
      topics: [
        { key: 'toilet_cleanliness', name: 'Tuvalet temizliği' },
        { key: 'staff_attitude', name: 'Personel tutumu' },
        { key: 'wait_time', name: 'Bekleme süresi' },
        { key: 'price', name: 'Fiyat' },
        { key: 'market_products', name: 'Market ürünleri' },
        { key: 'pump_equipment', name: 'Pompa/ekipman' },
        { key: 'other', name: 'Diğer' },
      ],
    },
    {
      sector: 'coffee',
      labelSetVersion: 1,
      topics: [
        { key: 'taste', name: 'Lezzet' },
        { key: 'staff_attitude', name: 'Personel tutumu' },
        { key: 'wait_time', name: 'Bekleme süresi' },
        { key: 'price', name: 'Fiyat' },
        { key: 'cleanliness', name: 'Temizlik' },
        { key: 'ambience', name: 'Ortam' },
        { key: 'other', name: 'Diğer' },
      ],
    },
  ],
};
