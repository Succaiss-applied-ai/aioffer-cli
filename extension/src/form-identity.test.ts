import { describe, expect, it } from "vitest";
import {
  stableFieldIdentity,
  stableSectionKey,
  stableSemanticSlot
} from "./form-identity.js";

describe("stable form identity", () => {
  it("keeps document type and number distinct independent of transient placeholders", () => {
    expect(stableSemanticSlot("证件类型", "请选择")).toBe("identity_document_type");
    expect(stableSemanticSlot("证件号码", "证件号码")).toBe("identity_document_number");
    expect(stableSemanticSlot("证件照")).toBe("identity_photo");
  });
  it("keeps repeated work fields aligned by section and group index", () => {
    const before = stableFieldIdentity({
      label: "工作经历 · 公司名称",
      sectionTitle: "工作经历",
      controlKind: "native",
      name: "company",
      groupIndex: 1
    });
    const after = stableFieldIdentity({
      label: "工作经历 · 公司名称",
      sectionTitle: "工作经历",
      controlKind: "native",
      name: "company",
      groupIndex: 1,
      localOrdinal: 8
    });

    expect(before.stableFieldKey).toBe("work[1].company.native");
    expect(after.stableFieldKey).toBe(before.stableFieldKey);
  });

  it("does not let plain city preference become a search keyword identity", () => {
    expect(stableSectionKey("意向城市", "申请信息")).toBe("intention");
    expect(stableSemanticSlot("意向城市")).toBe("preferred_city");
  });

  it("keeps a native-place cascader separate from preferred-city fields", () => {
    expect(stableSectionKey("籍贯", "个人信息")).toBe("basic");
    expect(stableSemanticSlot("籍贯", "请输入籍贯")).toBe("native_place");
    expect(stableFieldIdentity({
      label: "个人信息 · 籍贯",
      sectionTitle: "个人信息",
      controlKind: "combobox",
      placeholder: "请输入籍贯"
    }).stableFieldKey).toBe("basic.native_place.combobox");
  });

  it("normalizes bilingual birth-date-age controls to one basic identity", () => {
    expect(stableSectionKey("Birth Date (Age)", "Personal info")).toBe("basic");
    expect(stableSemanticSlot("出生日期 (年龄) / Birth Date (Age)")).toBe("birth_date");
    expect(stableFieldIdentity({
      label: "出生日期 (年龄) / Birth Date (Age)",
      sectionTitle: "个人信息 / Personal info",
      controlKind: "native"
    }).stableFieldKey).toBe("basic.birth_date.native");
  });

  it("lets intrinsic referral evidence override an incorrectly nearby city label", () => {
    expect(stableSemanticSlot("意向工作城市", "推荐码")).toBe("referral");
    expect(stableFieldIdentity({
      label: "申请信息 · 推荐码",
      sectionTitle: "申请信息",
      controlKind: "native",
      placeholder: "推荐码"
    }).stableFieldKey).toBe("other.referral.native");
  });

  it("normalizes ATS upload and parser-adjacent fields", () => {
    expect(stableFieldIdentity({
      label: "简历（必填）",
      controlKind: "file",
      groupIndex: null
    }).stableFieldKey).toBe("attachments.resume_file.file");
    expect(stableFieldIdentity({
      label: "证件照",
      controlKind: "file",
      groupIndex: null
    }).stableFieldKey).toBe("attachments.identity_photo.file");
  });
});
