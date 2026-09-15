import { expect,it } from "vitest";
import { selectorSearchValues } from "./selector-search-values.js";
it.each([["广州\n深圳",["广州","深圳"]],["中国",["中国"]],['["广州","深圳"]',["广州","深圳"]],["Washington, D.C.",["Washington, D.C."]]])("retains exact search values: %s",(input,expected)=>{
  expect(selectorSearchValues(input)).toEqual(expected);
});
it.each(["", "广州\n广州", '["广州",42]', '["广州",""]', '[invalid]'])("rejects invalid answer sets: %s",input=>expect(selectorSearchValues(input)).toBeNull());
