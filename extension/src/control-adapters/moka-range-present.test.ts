import {describe,it,expect,vi} from 'vitest';
import {executeMokaRangePresent} from './moka-range-present.js';
const point={x:10,y:20,tagName:'LABEL',className:'sd-Checkbox-container'};
function fixture(initial:boolean){
  let checked=initial, coupled=true, alterStart=false;
  const inspect=vi.fn(async()=>({actual:String(checked),startValues:alterStart?['2024','1']:['2025','9'],
    endCount:checked&&coupled?0:2,endDisabled:false,endEnabled:true,point}));
  const click=vi.fn(async()=>{checked=!checked;});
  return {inspect,click,prepareSurface:vi.fn(async()=>{}),wait:vi.fn(async()=>{}),
    set coupled(value:boolean){coupled=value;},set alterStart(value:boolean){alterStart=value;}};
}
describe('Moka range end choice transaction',()=>{
  it.each([[false,'true'],[true,'false']] as const)('switches %s → %s once and verifies the range',async(initial,expected)=>{
    const io=fixture(initial);const result=await executeMokaRangePresent(io,expected);
    expect(result).toMatchObject({success:true,actual:expected,clicks:1});expect(io.click).toHaveBeenCalledTimes(1);
  });
  it('does not click an already consistent range',async()=>{
    const io=fixture(true);expect(await executeMokaRangePresent(io,'true')).toMatchObject({success:true,clicks:0});
  });
  it('does not accept a checked checkbox whose end controls remain active or retry it',async()=>{
    const io=fixture(false);io.coupled=false;expect(await executeMokaRangePresent(io,'true')).toMatchObject({success:false,status:'range_readback_failed',clicks:1});
    expect(io.click).toHaveBeenCalledTimes(1);
  });
  it('stops when the same click changes the start value',async()=>{
    const io=fixture(false);io.wait.mockImplementation(async()=>{io.alterStart=true;});
    expect(await executeMokaRangePresent(io,'true')).toMatchObject({success:false,status:'start_value_changed',clicks:1});
  });
});
