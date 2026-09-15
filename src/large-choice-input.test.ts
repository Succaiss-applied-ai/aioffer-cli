import { describe, expect, it } from 'vitest';
import { candidateInformationRequestForField } from '../extension/src/vision-form-runtime.js';
import { requiredFieldInputKind } from './required-field-input.js';
import type { PageFieldObservation } from '../extension/src/page-adapter.js';
import { supplementalInputError } from './supplemental-input-error.js';
import { autoApplyJobResultSchema } from './gateway/auto-apply-contract.js';
import { normalizeSupplementalResult } from './gateway/supplemental-result.js';

const base: PageFieldObservation = { fieldId:'f', selector:'#f', label:'国家/地区',
  stableFieldKey:'basic.country.combobox', type:'combobox', controlKind:'combobox',
  required:true, currentValue:'', options:[] };

describe('large choice supplemental presentation', () => {
  it.each([100,101,200,1000])('uses the observed choice count %i without changing field ownership', count => {
    for (const label of ['国家/地区','学校名称','专业名称','自定义问题']) {
      const field={...base,label,options:Array.from({length:count},(_,i)=>`选项${i}`)};
      const request=candidateInformationRequestForField(field)!;
      expect(request.inputKind).toBe(count>100?'text':'select');
      expect(request).toMatchObject({fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,
        type:'combobox',controlKind:'combobox',options:field.options});
      expect(field.options).toHaveLength(count);
      const multiple=candidateInformationRequestForField({...field,type:'multi_select',controlKind:'multi_select'})!;
      expect(multiple).toMatchObject({inputKind:count>100?'textarea':'multi_select',
        type:'multi_select',controlKind:'multi_select',options:field.options});
      for (const returned of [request,multiple]) {
        expect(supplementalInputError(returned)).toBeNull();
        const receipt=autoApplyJobResultSchema.parse({schemaVersion:'auto-apply-job-result.v1',
          batchId:'11111111-1111-4111-8111-111111111111',batchJobId:'22222222-2222-4222-8222-222222222222',
          jobId:'job',status:'waiting_for_user_action',reasonCode:'missing_information',occurredAt:'2026-09-09T00:00:00Z',
          evidence:{redacted:true,requiredFieldRequests:[returned]}});
        expect(normalizeSupplementalResult(receipt)).toBe(receipt);
      }
    }
  });
  it('does not promote unknown or invalid controls, truncate oversized transport, or request optional fields',()=>{
    const options=Array.from({length:101},(_,i)=>`选项${i}`);
    expect(requiredFieldInputKind({type:'unknown',options})).toBeNull();
    expect(requiredFieldInputKind({type:'combobox',options:[...options,options[0]!]})).toBeNull();
    expect(requiredFieldInputKind({type:'multi_select',options:[...options,options[0]!]})).toBeNull();
    expect(candidateInformationRequestForField({...base,required:false,options})).toBeNull();
    expect(()=>candidateInformationRequestForField({...base,options:Array.from({length:1001},(_,i)=>`选项${i}`)})).toThrow();
    expect(requiredFieldInputKind({type:'date',controlKind:'native',options:[]})).toBe('date');
    expect(requiredFieldInputKind({type:'search',controlKind:'native',options:[]})).toBe('search');
    for (const request of [
      {...base,type:'unknown',options,inputKind:'text'},
      {...base,options:options.slice(0,100),inputKind:'text'},
      {...base,options:[...options,options[0]!],inputKind:'text'},
      {...base,type:'multi_select',controlKind:'multi_select',options,inputKind:'text'},
      {...base,options,inputKind:'textarea'}
    ]) expect(supplementalInputError(request)).not.toBeNull();
  });
});
