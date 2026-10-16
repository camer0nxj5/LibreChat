import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import CurrentSources from '../CurrentSources';
const mockSetCurrent=jest.fn(),mockSetSearch=jest.fn(),mockSetAdvanced=jest.fn();
jest.mock('~/hooks',()=>({useHasAccess:()=>true}));
jest.mock('~/Providers',()=>({useBadgeRowContext:()=>({currentSources:{toggleState:false,setToggleState:mockSetCurrent},webSearch:{setToggleState:mockSetSearch},advancedSearch:{setToggleState:mockSetAdvanced}})}));
jest.mock('@librechat/client',()=>({CheckboxButton:({label,setValue}:any)=><button onClick={()=>setValue({value:true})}>{label}</button>}));
it('enables current sources together with usable basic search',()=>{
 render(<CurrentSources/>);fireEvent.click(screen.getByText('Check current sources'));
 expect(mockSetCurrent).toHaveBeenCalledWith(true);expect(mockSetSearch).toHaveBeenCalledWith(true);expect(mockSetAdvanced).toHaveBeenCalledWith(false);
});
