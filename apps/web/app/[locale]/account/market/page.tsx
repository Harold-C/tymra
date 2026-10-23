import { RegionalMarket } from "@/components/member/RegionalMarket";
export default function RegionalMarketPage({params,searchParams}:{params:{locale:"en"|"zh"};searchParams:Record<string,string|undefined>}) {
  return <RegionalMarket locale={params.locale} initial={searchParams}/>;
}
