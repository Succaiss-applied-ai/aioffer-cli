import {describe,it,expect} from 'vitest';
import {requiredFieldInputKind} from './required-field-input.js';
import {candidateInformationRequestForField,siteRejectedInformationRequests} from '../extension/src/vision-form-runtime.js';
import type {PageFieldObservation} from '../extension/src/page-adapter.js';
const base: PageFieldObservation={fieldId:'f',selector:'#f',label:'学校名称',type:'text',controlKind:'native',required:true,currentValue:'',options:[],stableFieldKey:'education.school.native'};
describe('control-derived supplemental input contract',()=>{
  it.each(['学校名称','专业名称','籍贯','日期','自定义问题'])('same title can use every evidenced input: %s',label=>{
    for(const [patch,kind] of [
      [{type:'text',controlKind:'native'},'text'],
      [{type:'textarea',controlKind:'native'},'textarea'],
      [{type:'select',controlKind:'native',options:['A','B']},'select'],
      [{type:'combobox',controlKind:'combobox',options:['A','B']},'select'],
      [{type:'combobox',controlKind:'combobox',optionSource:'search'},'search'],
      [{type:'date',controlKind:'native'},'date'],
      [{type:'month',controlKind:'native'},'month']
    ] as const){
      const field={...base,...patch,options:[...('options' in patch?patch.options:[])],label} as PageFieldObservation;
      expect(candidateInformationRequestForField(field)).toMatchObject({inputKind:kind,fieldId:'f',stableFieldKey:base.stableFieldKey});
    }
  });
  it('requires live options for choices, never converts unknown, checkbox or empty select to editable input',()=>{
    for(const type of ['combobox','select','checkbox','radio','custom_widget']){
      expect(requiredFieldInputKind({type,controlKind:'native',options:[]})).toBeNull();
      expect(()=>candidateInformationRequestForField({...base,type})).toThrow('未能确定招聘页面控件');
    }
  });
  it('retains every rejected field and ready input when an unknown control occurs first or last',()=>{
    const unknown={...base,fieldId:'unknown',type:'combobox',controlKind:'combobox'};
    for(const fields of [[unknown,base],[base,unknown]]){
      try{siteRejectedInformationRequests(fields);throw Error('expected blocking error');}
      catch(error:any){expect(error.publicError.details).toMatchObject({
        rejectedFieldKeys:fields.map(f=>f.stableFieldKey),pendingInformationRequests:[{fieldId:'f',inputKind:'text'}]});
        expect(error.publicError.details).not.toHaveProperty('requiredFieldRequests');}
    }
  });
  it('preserves exact native datetime precision independently of the coarse date kind',()=>{
    expect(requiredFieldInputKind({type:'datetime-local',controlKind:'date'})).toBe('datetime-local');
    expect(candidateInformationRequestForField({...base,type:'datetime-local',controlKind:'date'})?.inputKind).toBe('datetime-local');
  });
  it.each(['text','textarea','select'])('does not omit a %s input solely because its title contains declaration or consent',type=>{
    const options=type==='select'?['同意','不同意']:[];
    expect(candidateInformationRequestForField({...base,label:'个人声明及授权说明',type,options})?.inputKind).toBe(type);
  });
});
