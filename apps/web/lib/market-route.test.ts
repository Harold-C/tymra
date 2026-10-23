import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({session:vi.fn(),load:vi.fn(),resolve:vi.fn()}));
vi.mock("@/lib/server/membership/customer-auth",()=>({getCustomerSession:mocks.session}));
vi.mock("@/lib/server/market-data",()=>({loadMarketData:mocks.load}));
vi.mock("@/lib/server/rate-limit",()=>({consumeRateLimit:()=>({allowed:true})}));
vi.mock("@tymra/providers/nz-localities",()=>({linzLocalitiesProvider:{cityGroups:async()=>[{region:"Canterbury",cities:["Christchurch City","Selwyn District"]}],resolve:mocks.resolve}}));
import {GET} from "../app/api/v1/customer/market/route";
const request=(query="")=>new NextRequest(`https://tymra.test/api/v1/customer/market?region=Canterbury&from=2026-10-14&to=2026-11-13${query}`);
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({id:"member"});mocks.load.mockResolvedValue({data:{version:1,asOf:"2026-10-14T00:00:00Z",rates:[],events:[],signals:[]},snapshot:true});});
describe("member regional market boundary",()=>{
  it("rejects anonymous access before querying datasets",async()=>{mocks.session.mockResolvedValue(null);expect((await GET(request())).status).toBe(401);expect(mocks.load).not.toHaveBeenCalled();});
  it("rejects invalid dates and excessive date ranges",async()=>{expect((await GET(request('&from=2026-02-30'))).status).toBe(422);expect((await GET(request('&to=2027-11-13'))).status).toBe(422);expect(mocks.load).not.toHaveBeenCalled();});
  it("rejects invalid region/city combinations and locality spoofing",async()=>{expect((await GET(request('&city=Auckland'))).status).toBe(422);mocks.resolve.mockResolvedValue({locality:{name:'Elsewhere',territorialAuthority:'Auckland'}});expect((await GET(request('&city=Christchurch+City&locality=1'))).status).toBe(422);expect(mocks.load).not.toHaveBeenCalled();});
  it("allows region-only read-only summaries without a room query",async()=>{const response=await GET(request());expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({scopeLabel:'Canterbury',snapshot:true,rateCount:0,eventCount:0,series:[]});});
});
