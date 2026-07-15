import {
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from '../../../scripts/base.mjs';

export const SITE = {
  name: SITE_NAME,
  shortName: SITE_SHORT_NAME,
  tagline: SITE_TAGLINE,
  description: SITE_DESCRIPTION,
  inLanguage: 'zh-TW',
  logoPath: '/icons/icon-512.png',
  ogImagePath: '/og/og-default.png',
  organization: {
    name: 'yao.care 藥提醒科技',
    legalName: 'yao.care 藥提醒科技',
    url: 'https://yao.care',
  },
  repo: 'https://github.com/yao-care/smart-pedi-cds',
  // sameAs 僅列真實存在且由本專案營運的官方據點，勿填未經營的社群帳號。
  sameAs: ['https://github.com/yao-care/smart-pedi-cds', 'https://yao.care'] as string[],
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
