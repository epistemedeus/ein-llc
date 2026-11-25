import { z } from "zod";

export const sources = {
  ss4: "https://www.irs.gov/instructions/iss4",
  ss4Form: "https://www.irs.gov/pub/irs-pdf/fss4.pdf",
  form5472: "https://www.irs.gov/instructions/i5472",
  form1120: "https://www.irs.gov/instructions/i1120",
  aprilHoliday: "https://www.irs.gov/pub/irs-drop/n-11-17.pdf",
  wyoming: "https://sos.wyo.gov/FAQS.aspx?root=BUS",
  wyomingFirst: "https://sos.wyo.gov/Forms/WyoBiz/What%27s_Next.pdf",
  wyomingTimeliness: "https://wyoleg.gov/statutes/compress/title16.pdf",
  wyomingHolidays: "https://sos.wyo.gov/Holiday.aspx",
  delaware: "https://delcode.delaware.gov/title6/c018/sc11/index.html",
};

export const rulesAsOf = "2026-11-25";
export const isoDay = z.iso.date().refine(value => value >= "1900-01-01" && value <= "9998-12-31");
export const usJurisdiction = z.enum(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);
