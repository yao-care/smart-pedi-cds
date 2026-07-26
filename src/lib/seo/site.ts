import {
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from '../../../scripts/base.mjs';

/**
 * 公司實體（藥提醒科技有限公司）——跨站共用，欄位勿改。
 *
 * `id` 一律指向官網的 https://www.yao.care/#organization：官網與 6 個產品站
 * 共指同一個節點，抓取器才能從產品走回公司。若改成各自網域的 #organization，
 * 會裂成 6 個彼此無關的公司實體，比沒有還糟。
 *
 * legalName 是「法律登記名稱」，只有中文一種寫法；英文一律用 yao.care，
 * 不要自創譯名。
 */
export const ORGANIZATION = {
  id: 'https://www.yao.care/#organization',
  name: 'yao.care',
  legalName: '藥提醒科技有限公司',
  alternateName: '藥提醒',
  url: 'https://www.yao.care',
  taxID: '83620786',
  email: 'service@yao.care',
  logoUrl: 'https://www.yao.care/assets/images/logo.png',
  address: {
    streetAddress: '台灣大道二段220號12樓',
    addressLocality: '台中市西區',
    addressCountry: 'TW',
  },
  sameAs: [
    'https://www.wikidata.org/wiki/Q140265007',
    'https://github.com/yao-care',
    'https://www.google.com/maps?cid=12025785010180313919',
  ],
  /** 本產品在官網的介紹頁，供正文與 sameAs 使用。 */
  productPage: 'https://www.yao.care/medical/pedi/',
} as const;

export const SITE = {
  name: SITE_NAME,
  shortName: SITE_SHORT_NAME,
  tagline: SITE_TAGLINE,
  description: SITE_DESCRIPTION,
  inLanguage: 'zh-TW',
  logoPath: '/icons/icon-512.png',
  ogImagePath: '/og/og-default.png',
  organization: ORGANIZATION,
  repo: 'https://github.com/yao-care/smart-pedi-cds',
  /** 本站 SoftwareApplication 節點的 @id。 */
  softwareId: 'https://smart-pedi-cds.yao.care/#software',
  // sameAs 僅列真實存在且由本專案營運的官方據點，勿填未經營的社群帳號。
  sameAs: [ORGANIZATION.productPage, 'https://github.com/yao-care/smart-pedi-cds'] as string[],
  /**
   * 評估工具之權威依據來源（E-E-A-T）。
   * 僅列本專案實際採用者，且每個 URL 皆須實測可達（勿憑印象填寫政府網站路徑）。
   * 與首頁「為什麼可以放心使用」及 /about 的常模來源聲明一致。
   *
   * 驗證方式注意：hpa.gov.tw 的 WAF 會擋 curl 與爬蟲（回 000／連線失敗），
   * 但真實瀏覽器可正常開啟。驗證此類連結請用瀏覽器實開，勿依 curl 結果
   * 誤判為失效而移除（2026-07-15 已用 Playwright 實開確認）。
   */
  citations: [
    {
      name: '衛生福利部國民健康署：兒童發展篩檢服務',
      url: 'https://www.hpa.gov.tw/Pages/List.aspx?nodeid=4816',
      note: '我國官方兒童發展篩檢制度與轉介流程',
    },
    {
      name: 'ASQ-3（Ages & Stages Questionnaires, Third Edition）',
      url: 'https://agesandstages.com/products-pricing/asq3/',
      note: '常模參照與 −1 / −2 SD 分流門檻之借用來源',
    },
  ],
} as const;
