/** UI "예제 불러오기"용 임베드 샘플(브라우저에서 별도 fetch 불필요). */

export const SAMPLE_NAME = "messy-orders.csv";

export const SAMPLE_CSV = [
  "order_id,customer,order_date,qty,unit_price,subtotal,tax,total,status",
  "1001,Alice,2024-01-05,2,500,1000,100,1100,paid",
  '1002,Bob,01/06/2024,1,"1,200","1,200",120,1320,paid',
  "1001,Alice,2024-01-05,2,500,1000,100,1100,paid",
  "1003, Alice ,2024-01-07,3,300,900,90,990,pending",
  "1004,Carol,2024-01-08,5,200,1000,100,1200,paid",
  "1005,Dave,2024/01/09,1,150,150,15,165,shipped",
  "1006,Eve,2024-01-10,2,250,500,50,,paid",
  "1007,Frank,2024-01-11,1,1000,1000,100,1100,unknown",
].join("\n");

/** 샘플에 어울리는 정합성 규칙(합계·참조). */
export const SAMPLE_ENGINE_OPTIONS = {
  integrity: {
    sumChecks: [{ components: ["subtotal", "tax"], total: "total" }],
    referentialChecks: [
      {
        column: "status",
        references: {
          values: ["paid", "pending", "shipped", "cancelled"],
        },
      },
    ],
  },
};
