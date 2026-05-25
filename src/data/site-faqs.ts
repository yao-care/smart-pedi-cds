export interface Faq {
  question: string;
  answer: string;
}

export const siteFaqs: Faq[] = [
  {
    question: '這個系統需要安裝什麼軟體嗎？',
    answer: '不需要。Smart Pedi 是一個純瀏覽器端應用程式，只需要現代瀏覽器（Chrome、Firefox、Safari、Edge）即可使用。所有運算邏輯在瀏覽器執行，無需安裝額外軟體或維護後端伺服器。',
  },
  {
    question: '如何連接醫院的 FHIR Server？',
    answer: '系統支援兩種連線模式：Standalone Launch 與 EHR Launch。Standalone 模式下，您可以在醫師工作台的設定中輸入 FHIR Server 位址進行連線；家長評估流程亦可選擇性連線。EHR Launch 模式下，醫院 EHR 系統會自動透過 SMART on FHIR 協議啟動本系統並傳入病患資料。',
  },
  {
    question: '病患資料會被傳送到外部伺服器嗎？',
    answer: '不會。本系統採用「隱私優先」設計，所有資料僅在您的瀏覽器與醫院 FHIR Server 之間流動。我們不收集、不儲存、不轉傳任何病患資料。系統本身為靜態網頁，部署後不需要任何後端伺服器。',
  },
];

export const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: siteFaqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
};
