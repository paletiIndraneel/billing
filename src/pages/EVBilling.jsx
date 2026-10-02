import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/Toast';

const TRIARC_STATE = '36';
const money = n => Number(n || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const gstState = g => g && /^\d{2}/.test(g.trim()) ? g.trim().slice(0,2) : null;

function words(n){
 const o=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],t=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
 const w=x=>{x=Math.floor(x);if(!x)return '';if(x<20)return o[x];if(x<100)return t[Math.floor(x/10)]+(x%10?' '+o[x%10]:'');if(x<1000)return o[Math.floor(x/100)]+' Hundred'+(x%100?' '+w(x%100):'');if(x<1e5)return w(x/1e3)+' Thousand'+(x%1e3?' '+w(x%1e3):'');if(x<1e7)return w(x/1e5)+' Lakh'+(x%1e5?' '+w(x%1e5):'');return w(x/1e7)+' Crore'+(x%1e7?' '+w(x%1e7):'')};
 const r=Math.floor(n||0),p=Math.round(((n||0)-r)*100); return 'INR '+(w(r)||'Zero')+' Rupees'+(p?' and '+w(p)+' Paise':'')+' Only';
}
function calc(items,type){
 let taxable=0,cgst=0,sgst=0,igst=0;
 const rows=items.map(x=>{const gross=+x.quantity*+x.unit_price,disc=gross*(+x.discount_percent||0)/100,tx=gross-disc,tax=tx*(+x.gst_rate||0)/100;taxable+=tx;if(type==='IGST')igst+=tax;else{cgst+=tax/2;sgst+=tax/2}return {...x,taxable_amount:tx,discount_amount:disc,line_total:tx+tax}});
 const tax=cgst+sgst+igst,total=taxable+tax,round=Math.round(total)-total;
 return {rows,taxable,cgst,sgst,igst,tax,round,total:total+round};
}
function pdf(inv,items,cfg){
  // PDF layout rebuilt from the supplied Excel invoice template.
  // The printable area is A1:G37. Keep this function aligned to that template.
  const d=new jsPDF({unit:'mm',format:'a4'});
  const safe=v=>v===null||v===undefined?'':String(v);
  const money2=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const money4=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:4,maximumFractionDigits:4});
  const company=inv.company_business_name?inv:(cfg||{});
  const addr=[
    company.company_address_line1||company.address_line1,
    company.company_address_line2||company.address_line2,
    company.company_city||company.city,
    company.company_state||company.state,
    company.company_pincode||company.pincode,
    company.company_country||company.country||'India'
  ].filter(Boolean).join(', ');
  const buyerAddr=[
    inv.billing_address_line1,inv.billing_address_line2,inv.billing_city,
    inv.billing_state,inv.billing_pincode,inv.billing_country||'India'
  ].filter(Boolean).join(', ');
  const stateName=safe(inv.place_of_supply||inv.billing_state);
  const stateCode=safe(inv.billing_state_code||inv.place_of_supply_state_code);
  const isIgst=Number(inv.igst_amount||0)>0;
  const BLUE=[182,221,232];
  const L=10,TOP=5,W=190,R=L+W;
  const rowH={1:10,2:7,3:11,4:6,5:7,6:7,7:7,8:7,9:7,10:7,11:6.5,12:6.5,13:6.5,14:7,15:8,16:8,17:8,18:8,19:7,20:7,21:7,22:8,23:10,24:5,25:5,26:7,27:7,28:7,29:9,30:5,31:7,32:11,33:8,34:8,35:10,36:8,37:8};
  const y={};
  let yy=TOP;
  for(let r=1;r<=37;r++){y[r]=yy;yy+=rowH[r];}
  const bottom=y[37]+rowH[37];
  // Excel A:G column widths scaled to the 190 mm invoice frame.
  const cw=[11,31,11.86,12.86,16.57,10.43,19], scale=W/cw.reduce((a,b)=>a+b,0), x=[L];
  cw.forEach(w=>x.push(x[x.length-1]+w*scale));
  const line=()=>{d.setDrawColor(0);d.setLineWidth(.25);};
  const rect=(x1,y1,x2,y2)=>d.rect(x1,y1,x2-x1,y2-y1);
  const hline=(r)=>d.line(L,y[r]+rowH[r],R,y[r]+rowH[r]);
  const center=(txt,x1,x2,yy,size=8,bold=false)=>{d.setFont('helvetica',bold?'bold':'normal');d.setFontSize(size);d.text(safe(txt),(x1+x2)/2,yy,{align:'center'});};
  const right=(txt,x1,x2,yy,size=8,bold=false)=>{d.setFont('helvetica',bold?'bold':'normal');d.setFontSize(size);d.text(safe(txt),x2-1,yy,{align:'right'});};
  const left=(txt,x1,yy,size=8,bold=false,maxWidth)=>{d.setFont('helvetica',bold?'bold':'normal');d.setFontSize(size);d.text(safe(txt),x1+1,yy,maxWidth?{maxWidth}:undefined);};

  // Outer invoice frame: one continuous, uniform border on all four sides.
  d.setDrawColor(0);
  d.setLineWidth(0.5);
  d.rect(L,TOP,W,bottom-TOP);
  // Restore the standard thinner weight for internal table/divider lines.
  line();

  // Header A1:G5
  d.setTextColor(255,0,0); center('Tax Invoice',L,R,y[1]+6.8,12,true); d.setTextColor(0,0,0);
  d.line(L,y[3]+rowH[3],R,y[3]+rowH[3]);
  d.line(L,y[4]+rowH[4],R,y[4]+rowH[4]);
  d.line(L,y[5]+rowH[5],R,y[5]+rowH[5]);
  center('M/s. '+(company.company_business_name||company.business_name||'TRIARC GROUP'),L,R,y[2]+5.2,13,true);
  center(addr,L+2,R-2,y[3]+7.0,7.4,false);
  center('GSTIN: '+(inv.company_gstin||company.company_gstin||cfg?.gstin||'36AAYFT2036P1ZB'),L,R,y[4]+4.5,8.2,true);
  left('Contact: '+(inv.company_phone||company.company_phone||cfg?.phone||'+91 7993356677'),L,y[5]+4.8,8);
  right('E-Mail: '+(inv.company_email||company.company_email||cfg?.email||'TRIARCGROUP9@GMAIL.COM'),L+95,R,y[5]+4.8,8);

  // Buyer / invoice metadata block A6:G14.
  d.line(x[4],y[6],x[4],y[14]+rowH[14]);
  // Invoice metadata rows are consecutive, matching the reference.
  // Invoice No. and Dated use the same row height as Invoice Period.
  d.line(x[5],y[6],x[5],y[9]);
  // Reference borders: Invoice Period, Invoice No., and Dated are
  // consecutive rows; Mode/Terms is one full-width field below them.
  d.line(x[4],y[6],R,y[6]);
  d.line(x[4],y[7],R,y[7]);
  d.line(x[4],y[8],R,y[8]);
  d.line(x[4],y[9],R,y[9]);
  d.line(L,y[14],R,y[14]);
  d.line(L,y[14]+rowH[14],R,y[14]+rowH[14]);
  left('Buyer (Bill to)',L,y[6]+5.0,9,true);
  left(inv.billing_name,L,y[7]+5.0,8.5);
  if(buyerAddr){
    // Keep the address inside the three address rows (8-10) without truncating it.
    // For longer addresses, progressively reduce the font size so all wrapped
    // lines remain visible before the State/GSTIN rows begin.
    const maxW=x[5]-L-3;
    let addressSize=7.6;
    let lines=d.splitTextToSize(buyerAddr,maxW);
    while(lines.length>3 && addressSize>5.8){
      addressSize-=0.3;
      d.setFont('helvetica','normal');
      d.setFontSize(addressSize);
      lines=d.splitTextToSize(buyerAddr,maxW);
    }
    lines.slice(0,3).forEach((t,i)=>left(t,L,y[8]+4.5+i*4.3,addressSize));
  }
  left('State Name: '+safe(inv.billing_state)+'   Code: '+stateCode,L,y[11]+4.6,7.6);
  left('GSTIN/UIN: '+safe(inv.billing_gstin),L,y[12]+4.6,7.6);
  left('Place of Supply: '+stateName,L,y[13]+4.6,7.6);
  left('Station: '+safe(inv.station),L,y[14]+5.0,8.5);

  // Metadata is a narrow right-hand block in the reference. Keep labels and values
  // separated so the long invoice-period value never overlaps its label.
  left('Invoice Period :',x[4],y[6]+4.8,7.3,true);
  right(fmtDate(inv.billing_period_from)+' - '+fmtDate(inv.billing_period_to),x[5],R,y[6]+4.8,6.5);
  left('Invoice No :',x[4],y[7]+5.0,8.2,true);
  right(inv.invoice_number,x[5],R,y[7]+5.0,7.5);
  left('Dated :',x[4],y[8]+5.0,8.2,true);
  right(fmtDate(inv.invoice_date),x[5],R,y[8]+5.0,7.5);
  left('Mode/Terms of Payment:',x[4],y[9]+5.0,7.2,false);

  // Service table A15:G18. The Excel template has exactly three service rows.
  d.setFillColor(...BLUE);d.rect(L+0.25,y[15],W-0.5,rowH[15],'F');
  // Top border of the service table header.
  d.line(L,y[15],R,y[15]);
  for(let i=0;i<8;i++)d.line(x[i],y[15],x[i],y[18]+rowH[18]);
  for(let r=15;r<=18;r++)hline(r);
  const headers=['Sl No.','Description of Services','GST Rate','Quantity (kWh)','Rate (Rs.)','per','Amount (Rs.)'];
  headers.forEach((v,i)=>center(v,x[i],x[i+1],y[15]+5.3,7.3,true));

  const rows=items.slice(0,3);
  for(let i=0;i<3;i++){
    const r=16+i, item=rows[i]||{};
    const desc=item.description ? item.description+' (HSN/SAC '+safe(item.hsn||'996749')+')' : '';
    center(i+1,x[0],x[1],y[r]+5.2,7.3);
    left(desc,x[1],y[r]+5.2,7.0,false,x[2]-x[1]-2);
    center(item.gst_rate!==undefined&&item.gst_rate!=='' ? (+item.gst_rate||0)+'%' : '',x[2],x[3],y[r]+5.2,7.2);
    right(item.quantity===undefined?'':money4(item.quantity),x[3],x[4],y[r]+5.2,7.2);
    right(item.unit_price===undefined?'':money4(item.unit_price),x[4],x[5],y[r]+5.2,7.2);
    center(item.unit||'UNT',x[5],x[6],y[r]+5.2,7.2);
    right(item.taxable_amount===undefined?'':money2(item.taxable_amount),x[6],x[7],y[r]+5.2,7.2);
  }

  // Summary rows A19:G23. The reference has no horizontal separators
  // through the label area; only the amount/value column is divided.
  for(let r=19;r<=21;r++){d.line(x[6],y[r],R,y[r]);}
  d.line(x[6],y[21]+rowH[21],R,y[21]+rowH[21]);
  d.line(x[6],y[19],x[6],y[21]+rowH[21]);
  [19,20,21].forEach(r=>right(
    r===19?'Sub Total (Taxable Value)':r===20?(isIgst?'IGST Output A/c @ '+(rows[0]?.gst_rate||0)+'%':'CGST + SGST'):'Rounding Off',
    L,x[6],y[r]+4.7,7.5,r===19
  ));
  right(money2(inv.taxable_amount),x[6],R,y[19]+4.7,7.5,true);
  right(money2(isIgst?inv.igst_amount:(Number(inv.cgst_amount||0)+Number(inv.sgst_amount||0))),x[6],R,y[20]+4.7,7.5);
  right(money2(inv.round_off),x[6],R,y[21]+4.7,7.5);

  d.setFillColor(...BLUE);d.rect(L+0.25,y[22],W-0.5,rowH[22],'F');
  d.line(L,y[22],R,y[22]);d.line(L,y[22]+rowH[22],R,y[22]+rowH[22]);
  // Reference Total row: the divider after Total quantity aligns
  // exactly with the Quantity (kWh) / Rate (Rs.) divider in the service table.
  d.line(x[4],y[22],x[4],y[22]+rowH[22]);
  center('Total',L,x[4],y[22]+5.3,8,true);
  right(money4(rows.reduce((n,r)=>n+(+r.quantity||0),0)),x[3],x[4],y[22]+5.3,7.5,true);
  right('Rs. '+money2(inv.grand_total),x[4],R,y[22]+5.3,8,true);

  left('Amount Chargeable (in words): '+words(inv.grand_total)+' (E. & O.E.)',L,y[23]+6.2,7.5,true,R-L-2);

  // Tax analysis A25:G29.
  // Keep the Tax Analysis blue fill strictly inside the outer black frame.
  d.setFillColor(...BLUE);
  d.rect(L+0.25,y[25]+0.25,W-0.5,rowH[25]-0.5,'F');
  d.setDrawColor(0);
  d.setLineWidth(0.5);
  d.line(L,y[25],R,y[25]);
  d.line(L,y[25]+rowH[25],R,y[25]+rowH[25]);
  line();
  // Center the heading within the Tax Analysis header row itself,
  // using the row's top and bottom boundaries rather than a fixed offset.
  center('Tax Analysis',L,R,y[25]+rowH[25]/2+1.2,9,true);
  for(let r=26;r<=28;r++)hline(r);
  const txCols=isIgst ? [L,x[2],x[3],x[4],x[6],R] : [L,x[2],x[3],x[4],x[5],x[6],R];
  txCols.forEach(xx=>d.line(xx,y[26],xx,y[28]+rowH[28]));
  const txHeaders=isIgst?['HSN/SAC','Taxable Value','IGST Rate','IGST Amount','Total Tax Amount']:['HSN/SAC','Taxable Value','GST Rate','CGST','SGST','Total Tax Amount'];
  txHeaders.forEach((v,i)=>center(v,txCols[i],txCols[i+1],y[26]+5.0,7.0,true));
  const groups={};
  rows.forEach(item=>{const h=item.hsn||'996749';const g=groups[h]||(groups[h]={taxable:0,gst:+item.gst_rate||0});g.taxable+=+item.taxable_amount||0;});
  const first=Object.entries(groups)[0]||['996749',{taxable:Number(inv.taxable_amount||0),gst:+rows[0]?.gst_rate||18}];
  const taxValue=Number(inv.taxable_amount||first[1].taxable||0), rate=first[1].gst||18;
  center(first[0],txCols[0],txCols[1],y[27]+5.0,7.0);
  right(money2(taxValue),txCols[1],txCols[2],y[27]+5.0,7.0);
  center(rate+'%',txCols[2],txCols[3],y[27]+5.0,7.0);
  if(isIgst){
    right(money2(inv.igst_amount),txCols[3],txCols[4],y[27]+5.0,7.0);
    right(money2(inv.igst_amount),txCols[4],txCols[5],y[27]+5.0,7.0);
  }else{
    right(money2(inv.cgst_amount),txCols[3],txCols[4],y[27]+5.0,7.0);
    right(money2(inv.sgst_amount),txCols[4],txCols[5],y[27]+5.0,7.0);
    right(money2(inv.total_tax),txCols[5],txCols[6],y[27]+5.0,7.0);
  }
  center('Total',txCols[0],txCols[1],y[28]+5.0,7.0,true);
  right(money2(taxValue),txCols[1],txCols[2],y[28]+5.0,7.0,true);
  if(isIgst){
    right(money2(inv.igst_amount),txCols[3],txCols[4],y[28]+5.0,7.0,true);
    right(money2(inv.igst_amount),txCols[4],txCols[5],y[28]+5.0,7.0,true);
  }else{
    right(money2(inv.cgst_amount),txCols[3],txCols[4],y[28]+5.0,7.0,true);
    right(money2(inv.sgst_amount),txCols[4],txCols[5],y[28]+5.0,7.0,true);
    right(money2(inv.total_tax),txCols[5],txCols[6],y[28]+5.0,7.0,true);
  }

  left('Tax Amount (in words): '+words(inv.total_tax),L,y[29]+6.0,7.5,true,R-L-2);

  left('Declaration',L,y[31]+5.0,8.5,true);
  left('We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.',L,y[32]+5.0,7.2,false,R-L-2);

  left("Customer's Seal and Signature",L,y[35]+6.0,7.2);
  right('for M/s. '+(inv.company_business_name||company.company_business_name||company.business_name||'TRIARC GROUP'),L+100,R,y[35]+6.0,7.2,true);
  center('This is a Computer Generated Invoice',L,R,y[37]+5.5,7.2);
  right('Authorised Signatory',L+120,R,y[37]+5.5,7.2);

  return d;
}
function Modal({title,children,onClose}){return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>;}

export default function EVBilling(){
 const toast=useToast(),[tab,setTab]=useState('invoices'),[customers,setCustomers]=useState([]),[inventory,setInventory]=useState([]),[invoices,setInvoices]=useState([]),[settings,setSettings]=useState(null);
 const [customer,setCustomer]=useState(''),[series,setSeries]=useState(''),[station,setStation]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[manualTax,setManualTax]=useState('CGST_SGST'),[items,setItems]=useState([]),[saving,setSaving]=useState(false),[editingInvoice,setEditingInvoice]=useState(null);
 const [customerModal,setCustomerModal]=useState(false),[inventoryModal,setInventoryModal]=useState(false),[assetModal,setAssetModal]=useState(false),[stationModal,setStationModal]=useState(false),[seriesModal,setSeriesModal]=useState(false),[placeModal,setPlaceModal]=useState(false),[customerSaving,setCustomerSaving]=useState(false),[stationSaving,setStationSaving]=useState(false),[seriesSaving,setSeriesSaving]=useState(false),[placeSaving,setPlaceSaving]=useState(false),[inventorySaving,setInventorySaving]=useState(false),[assetSaving,setAssetSaving]=useState(false),[editingCustomer,setEditingCustomer]=useState(null),[editingInventory,setEditingInventory]=useState(null),[editingAsset,setEditingAsset]=useState(null),[assets,setAssets]=useState([]),[stations,setStations]=useState([]),[seriesList,setSeriesList]=useState([]),[places,setPlaces]=useState([]),[place,setPlace]=useState(''),[placeCode,setPlaceCode]=useState('');
 const [stationName,setStationName]=useState(''),[seriesName,setSeriesName]=useState(''),[placeName,setPlaceName]=useState(''),[placeStateCode,setPlaceStateCode]=useState('');
 const emptyCustomerForm={name:'',gstin:'',pan:'',billing_address_line1:'',billing_city:'',billing_state:'',billing_pincode:'',place_of_supply:'',customer_state_code:''};
 const [customerForm,setCustomerForm]=useState(emptyCustomerForm);
 const emptyInventoryForm={product_name:'DC EV Charging',hsn:'996749',unit:'KWH',purchase_price:'',selling_price:'',gst_rate:'18',notes:'',inventory_type:'electricity'}; const [inventoryForm,setInventoryForm]=useState(emptyInventoryForm);
 const emptyAssetForm={asset_type:'charger',name:'',manufacturer:'',model:'',serial_number:'',asset_tag:'',site:'',location:'',status:'active',purchase_date:'',installation_date:'',warranty_start:'',warranty_end:'',ip_address:'',mac_address:'',firmware_version:'',notes:'',details:{rated_power_kw:'',connector_type:'',connector_count:'',input_voltage:'',output_voltage:'',max_current:'',meter_serial:'',ocpp_version:'',network_type:'',camera_resolution:'',lens:'',poe:'',nvr_channels:'',storage_capacity:'',hdd_serial:'',hdd_count:'',poe_ports:'',connected_cameras:''}}; const [assetForm,setAssetForm]=useState(emptyAssetForm);
 const load=async()=>{const [a,b,c,s,e,st,se,po]=await Promise.all([supabase.from('billing_customers').select('*').eq('active',true).order('name'),supabase.from('billing_invoices').select('*').order('invoice_date',{ascending:false}),supabase.from('billing_inventory').select('*').eq('active',true).eq('inventory_type','electricity').order('product_name'),supabase.from('billing_invoice_settings').select('*').limit(1).maybeSingle(),supabase.from('ev_assets').select('*').order('asset_type').order('name'),supabase.from('billing_invoice_stations').select('*').eq('active',true).order('name'),supabase.from('billing_invoice_series').select('*').eq('active',true).order('series'),supabase.from('billing_place_of_supply').select('*').eq('active',true).order('name')]);const err=[a,b,c,s,e,st,se,po].find(x=>x.error);if(err)throw err.error;setAssets(e.data||[]);setCustomers(a.data||[]);setInvoices(b.data||[]);setInventory(c.data||[]);setSettings(s.data);setStations(st.data||[]);setSeriesList(se.data||[]);setPlaces(po.data||[]);if(!series&&se.data?.length)setSeries(se.data[0].series);if(!station&&st.data?.length)setStation(st.data[0].name);if(!place&&po.data?.length){setPlace(po.data[0].name);setPlaceCode(po.data[0].state_code||'')}};
 useEffect(()=>{load().catch(e=>toast.error(e.message))},[]);
 const c=customers.find(x=>x.id===customer),auto=gstState(c?.gstin),taxType=auto?(auto===TRIARC_STATE?'CGST_SGST':'IGST'):manualTax,total=useMemo(()=>calc(items,taxType),[items,taxType]);
 const add=()=>{const p=inventory[0];if(!p)return toast.error('Add an inventory item first.');setItems(x=>[...x,{inventory_id:p.id,description:p.product_name,hsn:p.hsn||'',unit:p.unit||'PCS',quantity:1,unit_price:+p.selling_price||0,gst_rate:+p.gst_rate||0,discount_percent:0}])};
 const pick=(i,id)=>{const p=inventory.find(x=>x.id===id);if(!p)return;setItems(x=>x.map((r,n)=>n===i?{...r,inventory_id:p.id,description:p.product_name,hsn:p.hsn||'',unit:p.unit||'PCS',unit_price:+p.selling_price||0,gst_rate:+p.gst_rate||0}:r))};
 const openCustomer=(row=null)=>{setEditingCustomer(row);setCustomerForm(row?{name:row.name||'',gstin:row.gstin||'',pan:row.pan||'',billing_address_line1:row.billing_address_line1||'',billing_city:row.billing_city||'',billing_state:row.billing_state||'',billing_pincode:row.billing_pincode||'',place_of_supply:row.place_of_supply||'',customer_state_code:row.customer_state_code||''}:emptyCustomerForm);setCustomerModal(true)};
 const saveStation=async ev=>{ev.preventDefault();const name=stationName.trim();if(!name)return toast.error('Enter station name.');setStationSaving(true);try{const {data,error}=await supabase.from('billing_invoice_stations').insert({name,active:true}).select().single();if(error)throw error;setStations(x=>[...x,data].sort((a,b)=>a.name.localeCompare(b.name)));setStation(data.name);setStationName('');setStationModal(false);toast.success('Station added')}catch(e){toast.error(e.message||'Station creation failed')}finally{setStationSaving(false)}};
 const savePlace=async ev=>{ev.preventDefault();const name=placeName.trim(),code=placeStateCode.trim();if(!name||!/^\d{2}$/.test(code))return toast.error('Enter place of supply and a 2-digit state code.');setPlaceSaving(true);try{const {data,error}=await supabase.from('billing_place_of_supply').insert({name,state_code:code,active:true}).select().single();if(error)throw error;setPlaces(x=>[...x,data].sort((a,b)=>a.name.localeCompare(b.name)));setPlace(data.name);setPlaceCode(data.state_code);setPlaceName('');setPlaceStateCode('');setPlaceModal(false);toast.success('Place of Supply added')}catch(e){toast.error(e.message||'Place of Supply creation failed')}finally{setPlaceSaving(false)}};
 const saveSeries=async ev=>{ev.preventDefault();const value=seriesName.trim();if(!value)return toast.error('Enter invoice series.');setSeriesSaving(true);try{const {data,error}=await supabase.from('billing_invoice_series').insert({series:value,active:true}).select().single();if(error)throw error;setSeriesList(x=>[...x,data].sort((a,b)=>a.series.localeCompare(b.series)));setSeries(data.series);setSeriesName('');setSeriesModal(false);toast.success('Invoice series added')}catch(e){toast.error(e.message||'Invoice series creation failed')}finally{setSeriesSaving(false)}};
 const openAsset=(row=null)=>{setEditingAsset(row);setAssetForm(row?{...emptyAssetForm,...row,details:{...emptyAssetForm.details,...(row.details||{})}}:emptyAssetForm);setAssetModal(true)};
 const saveAsset=async ev=>{ev.preventDefault();if(!assetForm.name.trim())return toast.error('Enter asset name.');setAssetSaving(true);try{const payload={asset_type:assetForm.asset_type,name:assetForm.name.trim(),manufacturer:assetForm.manufacturer.trim()||null,model:assetForm.model.trim()||null,serial_number:assetForm.serial_number.trim()||null,asset_tag:assetForm.asset_tag.trim()||null,site:assetForm.site.trim()||null,location:assetForm.location.trim()||null,status:assetForm.status,purchase_date:assetForm.purchase_date||null,installation_date:assetForm.installation_date||null,warranty_start:assetForm.warranty_start||null,warranty_end:assetForm.warranty_end||null,ip_address:assetForm.ip_address.trim()||null,mac_address:assetForm.mac_address.trim()||null,firmware_version:assetForm.firmware_version.trim()||null,notes:assetForm.notes.trim()||null,details:assetForm.details};const q=editingAsset?supabase.from('ev_assets').update(payload).eq('id',editingAsset.id):supabase.from('ev_assets').insert(payload);const {data,error}=await q.select().single();if(error)throw error;setAssets(x=>(editingAsset?x.map(r=>r.id===data.id?data:r):[...x,data]).sort((a,b)=>a.asset_type.localeCompare(b.asset_type)||a.name.localeCompare(b.name)));setAssetModal(false);setEditingAsset(null);setAssetForm(emptyAssetForm);toast.success(editingAsset?'Asset updated':'Asset added')}catch(e){toast.error(e.message||'Asset save failed')}finally{setAssetSaving(false)}};
 const deleteAsset=async row=>{if(!window.confirm('Delete '+row.name+'?'))return;const {error}=await supabase.from('ev_assets').delete().eq('id',row.id);if(error)return toast.error(error.message);setAssets(x=>x.filter(r=>r.id!==row.id));toast.success('Asset deleted')};
 const openInventory=(row=null)=>{setEditingInventory(row);if(row){setInventoryForm({product_name:row.product_name||'DC EV Charging',hsn:'996749',unit:'KWH',purchase_price:row.purchase_price??'',selling_price:row.selling_price??'',gst_rate:row.gst_rate??'18',notes:row.notes||'',inventory_type:'electricity'});}else{setInventoryForm(emptyInventoryForm);}setInventoryModal(true)};
 const addCustomer=async e=>{e.preventDefault();if(!customerForm.name.trim())return toast.error('Enter customer name.');const normalizedGstin=customerForm.gstin.replace(/\s+/g,'').toUpperCase();if(normalizedGstin && !/^\d{15}$/.test(normalizedGstin) && !/^[A-Z0-9]{15}$/.test(normalizedGstin))return toast.error('GSTIN must be exactly 15 letters/numbers.');setCustomerSaving(true);try{const payload={customer_type:'business',name:customerForm.name.trim(),gstin:normalizedGstin||null,pan:customerForm.pan.trim()||null,billing_address_line1:customerForm.billing_address_line1.trim()||null,billing_city:customerForm.billing_city.trim()||null,billing_state:customerForm.billing_state.trim()||null,billing_pincode:customerForm.billing_pincode.trim()||null,place_of_supply:customerForm.place_of_supply.trim()||customerForm.billing_state.trim()||null,customer_state_code:customerForm.customer_state_code.trim()||gstState(customerForm.gstin),active:true};const query=editingCustomer?supabase.from('billing_customers').update(payload).eq('id',editingCustomer.id):supabase.from('billing_customers').insert(payload);const {data,error}=await query.select().single();if(error)throw error;setCustomers(x=>{const next=editingCustomer?x.map(r=>r.id===data.id?data:r):[...x,data];return next.sort((a,b)=>a.name.localeCompare(b.name))});setCustomer(data.id);setCustomerModal(false);setCustomerForm(emptyCustomerForm);setEditingCustomer(null);toast.success(editingCustomer?'Customer updated':'Customer added')}catch(e){toast.error(e.message||'Customer creation failed')}finally{setCustomerSaving(false)}};
 const addInventory=async e=>{e.preventDefault();if(!inventoryForm.product_name.trim())return toast.error('Enter item name.');if(!inventoryForm.selling_price || +inventoryForm.selling_price<0)return toast.error('Enter a valid rate.');if(inventoryForm.gst_rate==='' || +inventoryForm.gst_rate<0)return toast.error('Enter a valid GST rate.');setInventorySaving(true);try{const payload={product_name:inventoryForm.product_name.trim(),hsn:'996749',unit:'KWH',purchase_price:inventoryForm.purchase_price===''?null:+inventoryForm.purchase_price,selling_price:+inventoryForm.selling_price,gst_rate:+inventoryForm.gst_rate,stock_tracked:false,stock_qty:0,min_stock_qty:0,batch_no:null,expiry_date:null,supplier_name:null,notes:inventoryForm.notes.trim()||null,inventory_type:'electricity',active:true};const query=editingInventory?supabase.from('billing_inventory').update(payload).eq('id',editingInventory.id):supabase.from('billing_inventory').insert(payload);const {data,error}=await query.select().single();if(error)throw error;setInventory(x=>{const next=editingInventory?x.map(r=>r.id===data.id?data:r):[...x,data];return next.sort((a,b)=>a.product_name.localeCompare(b.product_name))});setInventoryModal(false);setInventoryForm(emptyInventoryForm);setEditingInventory(null);toast.success(editingInventory?'Billing item updated':'Billing item added');if(!items.length)setItems([{inventory_id:data.id,description:data.product_name,hsn:data.hsn||'',unit:data.unit||'KWH',quantity:1,unit_price:+data.selling_price||0,gst_rate:+data.gst_rate||0,discount_percent:0}]);}catch(e){toast.error(e.message||'Billing item creation failed')}finally{setInventorySaving(false)}};
 const openEditInvoice=async inv=>{try{const {data:rows,error}=await supabase.from('billing_items').select('*').eq('invoice_id',inv.id).order('created_at');if(error)throw error;setEditingInvoice(inv);setCustomer(inv.customer_id||'');setSeries(inv.invoice_series||'');setStation(inv.station||'');setPlace(inv.place_of_supply||'');setPlaceCode(inv.place_of_supply_state_code||'');setFrom(inv.billing_period_from||'');setTo(inv.billing_period_to||'');setManualTax(Number(inv.igst_amount||0)>0?'IGST':'CGST_SGST');setItems((rows||[]).map(x=>({inventory_id:x.inventory_id,description:x.description,hsn:x.hsn||'',unit:x.unit||'KWH',quantity:x.quantity,unit_price:x.unit_price,gst_rate:x.gst_rate,discount_percent:x.discount_percent||0})));setTab('new');}catch(e){toast.error(e.message||'Unable to load invoice for editing')}};
 const save=async()=>{if(!c)return toast.error('Select a customer.');if(!from||!to||new Date(from)>new Date(to))return toast.error('Enter a valid billing period.');if(!station.trim())return toast.error('Select the charging station.');if(!place.trim())return toast.error('Select the place of supply.');if(!items.length)return toast.error('Add at least one item.');setSaving(true);try{const invoiceNumber=editingInvoice?editingInvoice.invoice_number:(await supabase.rpc('next_billing_invoice_number',{p_series:series.trim()})).data;if(!invoiceNumber)throw new Error('Unable to determine invoice number.');const {data:u}=await supabase.auth.getUser();const base={invoice_number:invoiceNumber,invoice_series:editingInvoice?editingInvoice.invoice_series:series.trim(),invoice_date:editingInvoice?editingInvoice.invoice_date:new Date().toISOString().slice(0,10),customer_id:c.id,billing_name:c.name,billing_gstin:c.gstin||null,billing_pan:c.pan||null,billing_address_line1:c.billing_address_line1,billing_address_line2:c.billing_address_line2,billing_city:c.billing_city,billing_state:c.billing_state,billing_state_code:c.customer_state_code||gstState(c.gstin),billing_pincode:c.billing_pincode,billing_country:c.billing_country||'India',place_of_supply:place.trim(),place_of_supply_state_code:placeCode||c.customer_state_code||gstState(c.gstin),station:station.trim(),billing_period_from:from,billing_period_to:to,subtotal:total.taxable,discount_total:0,taxable_amount:total.taxable,cgst_amount:total.cgst,sgst_amount:total.sgst,igst_amount:total.igst,cess_amount:0,total_tax:total.tax,round_off:total.round,grand_total:total.total,invoice_status:'issued'};if(!editingInvoice){base.company_business_name=settings?.business_name||null;base.company_legal_name=settings?.legal_name||null;base.company_gstin=settings?.gstin||null;base.company_pan=settings?.pan||null;base.company_address_line1=settings?.address_line1||null;base.company_address_line2=settings?.address_line2||null;base.company_city=settings?.city||null;base.company_state=settings?.state||null;base.company_state_code=settings?.state_code||null;base.company_pincode=settings?.pincode||null;base.company_country=settings?.country||'India';base.company_phone=settings?.phone||null;base.company_email=settings?.email||null;base.company_website=settings?.website||null;base.created_by=u.user?.id||null;}const {data:inv,error:ie}=editingInvoice?await supabase.from('billing_invoices').update(base).eq('id',editingInvoice.id).select().single():await supabase.from('billing_invoices').insert({...base,created_by:u.user?.id||null}).select().single();if(ie)throw ie;const rows=total.rows.map(x=>({invoice_id:inv.id,inventory_id:x.inventory_id,description:x.description,hsn:x.hsn||null,unit:x.unit,quantity:+x.quantity,unit_price:+x.unit_price,discount_percent:+x.discount_percent||0,discount_amount:x.discount_amount,taxable_amount:x.taxable_amount,gst_rate:+x.gst_rate,cgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,cgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,sgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,sgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,igst_rate:taxType==='IGST'?+x.gst_rate:0,igst_amount:taxType==='IGST'?x.taxable_amount*+x.gst_rate/100:0,cess_rate:0,cess_amount:0,line_total:x.line_total,tax_type:taxType}));if(editingInvoice){const {error:de}=await supabase.from('billing_items').delete().eq('invoice_id',inv.id);if(de)throw de;}const {data:saved,error:se}=await supabase.from('billing_items').insert(rows).select();if(se)throw se;setInvoices(x=>[inv,...x.filter(r=>r.id!==inv.id)]);setItems([]);setCustomer('');setStation('');setPlace('');setPlaceCode('');setFrom('');setTo('');setEditingInvoice(null);setTab('invoices');toast.success(editingInvoice?'EV Billing invoice updated':'EV Billing invoice created');pdf(inv,saved,settings).save(inv.invoice_number+'.pdf');}catch(e){toast.error(e.message||'Invoice save failed')}finally{setSaving(false)}};
 const download=async inv=>{const [{data:i,error:ie}]=await Promise.all([supabase.from('billing_items').select('*').eq('invoice_id',inv.id).order('created_at')]);if(ie)return toast.error(ie.message);pdf(inv,i,settings).save(inv.invoice_number+'.pdf')};
 const deleteInvoice=async inv=>{if(!window.confirm('Delete invoice '+inv.invoice_number+'? Its invoice items will also be deleted.'))return;const {error}=await supabase.from('billing_invoices').delete().eq('id',inv.id);if(error)return toast.error(error.message);setInvoices(x=>x.filter(r=>r.id!==inv.id));toast.success('Invoice deleted')};
 const deleteCustomer=async row=>{if(!window.confirm('Delete customer '+row.name+'?'))return;const {count,error:ce}=await supabase.from('billing_invoices').select('id',{count:'exact',head:true}).eq('customer_id',row.id);if(ce)return toast.error(ce.message);if(count)return toast.error('Customer cannot be deleted because invoices exist for this customer.');const {error}=await supabase.from('billing_customers').delete().eq('id',row.id);if(error)return toast.error(error.message);setCustomers(x=>x.filter(r=>r.id!==row.id));toast.success('Customer deleted')};
 const deleteInventory=async row=>{if(!window.confirm('Delete billing item '+row.product_name+'?'))return;const {count,error:ce}=await supabase.from('billing_items').select('id',{count:'exact',head:true}).eq('inventory_id',row.id);if(ce)return toast.error(ce.message);if(count)return toast.error('Billing item cannot be deleted because it is used on invoices. Deactivate it instead.');const {error}=await supabase.from('billing_inventory').delete().eq('id',row.id);if(error)return toast.error(error.message);setInventory(x=>x.filter(r=>r.id!==row.id));toast.success('Charging item deleted')};

 return <div className="page-container">
  <div className="page-header"><div><h1>EV Billing</h1><p>Triarc EV charging tax invoices</p></div><div><button className="btn btn-secondary" onClick={()=>load()}><RefreshCw size={14}/> Refresh</button> <button className="btn btn-primary" onClick={()=>setTab('new')}><Plus size={14}/> New Bill</button></div></div>
  <div className="tabs"><button className={tab==='invoices'?'tab active':'tab'} onClick={()=>setTab('invoices')}>Invoices</button><button className={tab==='new'?'tab active':'tab'} onClick={()=>setTab('new')}>New Invoice</button><button className={tab==='customers'?'tab active':'tab'} onClick={()=>setTab('customers')}>Customers</button><button className={tab==='billing-items'?'tab active':'tab'} onClick={()=>setTab('billing-items')}>Billing Items</button><button className={tab==='assets'?'tab active':'tab'} onClick={()=>setTab('assets')}>Asset Register</button></div>
  {tab==='invoices'&&<div className="card"><div className="table-container"><table><thead><tr><th>Invoice No.</th><th>Date</th><th>Customer</th><th>Place of Supply</th><th>Station</th><th>Total</th><th>Actions</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{i.invoice_number}</td><td>{fmtDate(i.invoice_date)}</td><td>{i.billing_name}</td><td>{i.place_of_supply||'-'}</td><td>{i.station||'-'}</td><td>₹{money(i.grand_total)}</td><td><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button className="btn btn-secondary" onClick={()=>download(i)}><Download size={14}/> PDF</button><button className="btn btn-secondary" onClick={()=>openEditInvoice(i)}>Edit</button><button className="btn btn-danger" onClick={()=>deleteInvoice(i)}><Trash2 size={14}/> Delete</button><label style={{display:'inline-flex',alignItems:'center',gap:5,cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={!!i.payment_received} onChange={async e=>{const value=e.target.checked;const {error}=await supabase.from('billing_invoices').update({payment_received:value}).eq('id',i.id);if(error){toast.error(error.message);return}setInvoices(x=>x.map(r=>r.id===i.id?{...r,payment_received:value}:r));toast.success(value?'Payment marked received':'Payment marked pending')}}/> Payment Received</label></div></td></tr>)}{!invoices.length&&<tr><td colSpan="7">No EV invoices yet.</td></tr>}</tbody></table></div></div>}
  {tab==='customers'&&<div className="card"><div className="page-header"><div><h2>Customer Management</h2><p>Manage customers used for GST invoices.</p></div><button className="btn btn-primary" onClick={()=>openCustomer()}><Plus size={14}/> Add Customer</button></div><div className="table-container"><table><thead><tr><th>Customer</th><th>GSTIN</th><th>PAN</th><th>Place of Supply</th><th>State Code</th><th>Status</th><th></th></tr></thead><tbody>{customers.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.gstin||'-'}</td><td>{r.pan||'-'}</td><td>{r.place_of_supply||r.billing_state||'-'}</td><td>{r.customer_state_code||'-'}</td><td>{r.active?'Active':'Inactive'}</td><td><div style={{display:'flex',gap:6}}><button className="btn btn-secondary" onClick={()=>openCustomer(r)}>Edit</button><button className="btn btn-secondary" onClick={()=>deleteCustomer(r)}><Trash2 size={14}/></button></div></td></tr>)}{!customers.length&&<tr><td colSpan="7">No customers yet.</td></tr>}</tbody></table></div></div>}
  {tab==='assets'&&<div className="card"><div className="page-header"><div><h2>Asset Register</h2><p>Track chargers, cameras, NVRs and other physical EV station equipment.</p></div><button className="btn btn-primary" onClick={()=>openAsset()}><Plus size={14}/> Add Asset</button></div><div className="table-container"><table><thead><tr><th>Type</th><th>Name</th><th>Company</th><th>Model</th><th>Serial Number</th><th>IP</th><th>MAC</th><th>Site</th><th>Status</th><th></th></tr></thead><tbody>{assets.map(r=><tr key={r.id}><td>{r.asset_type.toUpperCase()}</td><td>{r.name}</td><td>{r.manufacturer||'-'}</td><td>{r.model||'-'}</td><td>{r.serial_number||'-'}</td><td>{r.ip_address||'-'}</td><td>{r.mac_address||'-'}</td><td>{r.site||'-'}</td><td>{r.status}</td><td><div style={{display:'flex',gap:6}}><button className="btn btn-secondary" onClick={()=>openAsset(r)}>Edit</button><button className="btn btn-secondary" onClick={()=>deleteAsset(r)}><Trash2 size={14}/></button></div></td></tr>)}{!assets.length&&<tr><td colSpan="10">No assets yet.</td></tr>}</tbody></table></div></div>}
  {tab==='billing-items'&&<div className="card"><div className="page-header"><div><h2>Billing Items</h2><p>Billable EV charging services. Item names are entered manually.</p></div><button className="btn btn-primary" onClick={()=>openInventory()}><Plus size={14}/> Add Billing Item</button></div><div className="table-container"><table><thead><tr><th>Item Name</th><th>HSN/SAC</th><th>Unit</th><th>Rate / KWH</th><th>GST</th><th></th></tr></thead><tbody>{inventory.map(r=><tr key={r.id}><td>{r.product_name}</td><td>{r.hsn||'996749'}</td><td>{r.unit||'KWH'}</td><td>₹{money(r.selling_price)}</td><td>{r.gst_rate}%</td><td><div style={{display:'flex',gap:6}}><button className="btn btn-secondary" onClick={()=>openInventory(r)}>Edit</button><button className="btn btn-secondary" onClick={()=>deleteInventory(r)}><Trash2 size={14}/></button></div></td></tr>)}{!inventory.length&&<tr><td colSpan="6">No billing items yet.</td></tr>}</tbody></table></div></div>}
  {tab==='new'&&<div className="card"><div className="page-header"><div><h2>{editingInvoice?'Edit EV Billing Invoice':'New EV Billing Invoice'}</h2>{editingInvoice&&<p>Editing {editingInvoice.invoice_number}. Invoice number remains unchanged.</p>}</div>{editingInvoice&&<button className="btn btn-secondary" onClick={()=>{setEditingInvoice(null);setItems([]);setCustomer('');setStation('');setFrom('');setTo('');setTab('invoices')}}>Cancel Edit</button>}</div><div className="form-grid">
    <label>Customer<div className="field-with-action"><select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Select customer</option>{customers.map(x=><option value={x.id} key={x.id}>{x.name}{x.gstin?' — '+x.gstin:''}</option>)}</select><button type="button" className="btn btn-secondary" title="Add customer" onClick={()=>openCustomer()}><Plus size={14}/></button></div></label>
    <label>Invoice Series<div className="field-with-action"><select value={series} disabled={!!editingInvoice} onChange={e=>setSeries(e.target.value)}><option value="">Select invoice series</option>{seriesList.map(x=><option value={x.series} key={x.id}>{x.series}</option>)}</select><button type="button" className="btn btn-secondary" title="Add invoice series" onClick={()=>setSeriesModal(true)}><Plus size={14}/></button></div></label>
    <label>Station<div className="field-with-action"><select value={station} onChange={e=>setStation(e.target.value)}><option value="">Select station</option>{stations.map(x=><option value={x.name} key={x.id}>{x.name}</option>)}</select><button type="button" className="btn btn-secondary" title="Add station" onClick={()=>setStationModal(true)}><Plus size={14}/></button></div></label>
    <label>Place of Supply<div className="field-with-action"><select value={place} onChange={e=>{const v=e.target.value;const p=places.find(x=>x.name===v);setPlace(v);setPlaceCode(p?.state_code||'')}}><option value="">Select place of supply</option>{places.map(x=><option value={x.name} key={x.id}>{x.name} ({x.state_code})</option>)}</select><button type="button" className="btn btn-secondary" title="Add place of supply" onClick={()=>setPlaceModal(true)}><Plus size={14}/></button></div></label>
    <label>Billing Period From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Billing Period To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label>GST Type{auto?<input value={auto===TRIARC_STATE?'CGST + SGST':'IGST'} readOnly/>:<select value={manualTax} onChange={e=>setManualTax(e.target.value)}><option value="CGST_SGST">CGST + SGST</option><option value="IGST">IGST</option></select>}</label>
   </div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:20}}><h3>Charging Items</h3><div style={{display:'flex',gap:8}}><button className="btn btn-secondary" onClick={()=>inventory.length?add():setInventoryModal(true)}><Plus size={14}/> Add Item</button><button className="btn btn-secondary" onClick={()=>openInventory()}><Plus size={14}/> New Item</button></div></div>
   <div className="table-container"><table><thead><tr><th>Item</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST%</th><th></th></tr></thead><tbody>{items.map((x,i)=><tr key={i}><td><select value={x.inventory_id} onChange={e=>pick(i,e.target.value)}>{inventory.map(p=><option key={p.id} value={p.id}>{p.product_name}</option>)}</select></td><td>{x.hsn||'-'}</td><td><input type="number" min="0" step="0.001" value={x.quantity} onChange={e=>setItems(r=>r.map((z,n)=>n===i?{...z,quantity:e.target.value}:z))}/></td><td>{x.unit}</td><td><input type="number" min="0" step="0.01" value={x.unit_price} onChange={e=>setItems(r=>r.map((z,n)=>n===i?{...z,unit_price:e.target.value}:z))}/></td><td>{x.gst_rate}%</td><td><button className="btn btn-secondary" onClick={()=>setItems(r=>r.filter((_,n)=>n!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
   <div style={{maxWidth:320,marginLeft:'auto',marginTop:16}}><div className="summary-row"><span>Taxable Amount</span><b>₹{money(total.taxable)}</b></div>{taxType==='IGST'?<div className="summary-row"><span>IGST</span><b>₹{money(total.igst)}</b></div>:<><div className="summary-row"><span>CGST</span><b>₹{money(total.cgst)}</b></div><div className="summary-row"><span>SGST</span><b>₹{money(total.sgst)}</b></div></>}<div className="summary-row"><span>Round Off</span><b>₹{money(total.round)}</b></div><div className="summary-row total"><span>Total</span><b>₹{money(total.total)}</b></div></div>
   <div style={{textAlign:'right',marginTop:16}}><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?(editingInvoice?'Saving…':'Creating…'):(editingInvoice?'Save Invoice Changes':'Create EV Billing Invoice')}</button></div>
  </div>}
  {placeModal&&<Modal title="Add Place of Supply" onClose={()=>setPlaceModal(false)}><form onSubmit={savePlace}><div className="form-grid modal-grid"><label>Place of Supply *<input autoFocus value={placeName} onChange={e=>setPlaceName(e.target.value)} placeholder="Kerala"/></label><label>State Code *<input maxLength="2" value={placeStateCode} onChange={e=>setPlaceStateCode(e.target.value.replace(/\D/g,'').slice(0,2))} placeholder="32"/></label></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setPlaceModal(false)}>Cancel</button><button className="btn btn-primary" disabled={placeSaving}>{placeSaving?'Saving…':'Add Place of Supply'}</button></div></form></Modal>}
  {stationModal&&<Modal title="Add Station" onClose={()=>setStationModal(false)}><form onSubmit={saveStation}><div className="form-grid modal-grid"><label>Station Name *<input autoFocus value={stationName} onChange={e=>setStationName(e.target.value)} placeholder="Triarc EV Hub | Bhadrachalam"/></label></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setStationModal(false)}>Cancel</button><button className="btn btn-primary" disabled={stationSaving}>{stationSaving?'Saving…':'Add Station'}</button></div></form></Modal>}
  {seriesModal&&<Modal title="Add Invoice Series" onClose={()=>setSeriesModal(false)}><form onSubmit={saveSeries}><div className="form-grid modal-grid"><label>Invoice Series *<input autoFocus value={seriesName} onChange={e=>setSeriesName(e.target.value)} placeholder="GST-26/27"/></label></div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setSeriesModal(false)}>Cancel</button><button className="btn btn-primary" disabled={seriesSaving}>{seriesSaving?'Saving…':'Add Series'}</button></div></form></Modal>}
  {customerModal&&<Modal title={editingCustomer?"Edit Customer":"Add Customer"} onClose={()=>setCustomerModal(false)}><form onSubmit={addCustomer}><div className="customer-master-note">EV Billing Customer Master · Business customer</div><div className="form-grid modal-grid">
    <label>Customer Name *<input autoFocus value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="Customer / Company Name"/></label><label>GSTIN<input maxLength="15" value={customerForm.gstin} onChange={e=>setCustomerForm({...customerForm,gstin:e.target.value.toUpperCase()})}/></label><label>PAN<input maxLength="10" value={customerForm.pan} onChange={e=>setCustomerForm({...customerForm,pan:e.target.value.toUpperCase()})}/></label><label>Billing Address<input value={customerForm.billing_address_line1} onChange={e=>setCustomerForm({...customerForm,billing_address_line1:e.target.value})}/></label><label>City<input value={customerForm.billing_city} onChange={e=>setCustomerForm({...customerForm,billing_city:e.target.value})}/></label><label>State<input value={customerForm.billing_state} onChange={e=>setCustomerForm({...customerForm,billing_state:e.target.value})}/></label><label>Pincode<input value={customerForm.billing_pincode} onChange={e=>setCustomerForm({...customerForm,billing_pincode:e.target.value})}/></label><label>Place of Supply<input value={customerForm.place_of_supply} onChange={e=>setCustomerForm({...customerForm,place_of_supply:e.target.value})} placeholder="Kerala"/></label><label>State Code<input maxLength="2" value={customerForm.customer_state_code || gstState(customerForm.gstin) || ''} onChange={e=>setCustomerForm({...customerForm,customer_state_code:e.target.value.replace(/\D/g,'').slice(0,2)})} placeholder="Auto from GSTIN"/></label>
   </div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setCustomerModal(false)}>Cancel</button><button className="btn btn-primary" disabled={customerSaving}>{customerSaving?'Saving…':editingCustomer?'Save Changes':'Add Customer'}</button></div></form></Modal>}
  {assetModal&&<Modal title={editingAsset?"Edit Asset":"Add Asset"} onClose={()=>setAssetModal(false)}><form onSubmit={saveAsset}><div className="form-grid modal-grid">
<label>Asset Type *<select value={assetForm.asset_type} onChange={e=>setAssetForm({...assetForm,asset_type:e.target.value})}><option value="charger">EV Charger</option><option value="camera">Camera</option><option value="nvr">NVR</option></select></label><label>Name *<input autoFocus value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})} placeholder={assetForm.asset_type==='charger'?'60kW DC Charger':assetForm.asset_type==='camera'?'PoE Camera':'8 Channel NVR'}/></label><label>Company / Manufacturer<input value={assetForm.manufacturer} onChange={e=>setAssetForm({...assetForm,manufacturer:e.target.value})}/></label><label>Model<input value={assetForm.model} onChange={e=>setAssetForm({...assetForm,model:e.target.value})}/></label><label>Serial Number<input value={assetForm.serial_number} onChange={e=>setAssetForm({...assetForm,serial_number:e.target.value})}/></label><label>Asset Tag<input value={assetForm.asset_tag} onChange={e=>setAssetForm({...assetForm,asset_tag:e.target.value})}/></label><label>Site<input value={assetForm.site} onChange={e=>setAssetForm({...assetForm,site:e.target.value})}/></label><label>Location<input value={assetForm.location} onChange={e=>setAssetForm({...assetForm,location:e.target.value})}/></label><label>Status<select value={assetForm.status} onChange={e=>setAssetForm({...assetForm,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label><label>IP Address<input value={assetForm.ip_address} onChange={e=>setAssetForm({...assetForm,ip_address:e.target.value})}/></label><label>MAC Address<input value={assetForm.mac_address} onChange={e=>setAssetForm({...assetForm,mac_address:e.target.value})}/></label><label>Firmware Version<input value={assetForm.firmware_version} onChange={e=>setAssetForm({...assetForm,firmware_version:e.target.value})}/></label><label>Purchase Date<input type="date" value={assetForm.purchase_date} onChange={e=>setAssetForm({...assetForm,purchase_date:e.target.value})}/></label><label>Installation Date<input type="date" value={assetForm.installation_date} onChange={e=>setAssetForm({...assetForm,installation_date:e.target.value})}/></label><label>Warranty Start<input type="date" value={assetForm.warranty_start} onChange={e=>setAssetForm({...assetForm,warranty_start:e.target.value})}/></label><label>Warranty End<input type="date" value={assetForm.warranty_end} onChange={e=>setAssetForm({...assetForm,warranty_end:e.target.value})}/></label>
{assetForm.asset_type==='charger'&&<div><label>Rated Power (kW)<input value={assetForm.details.rated_power_kw} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,rated_power_kw:e.target.value}})} placeholder="60"/></label><label>Connector Type<input value={assetForm.details.connector_type} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,connector_type:e.target.value}})} placeholder="CCS2"/></label><label>Connector Count<input value={assetForm.details.connector_count} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,connector_count:e.target.value}})}/></label><label>Input Voltage<input value={assetForm.details.input_voltage} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,input_voltage:e.target.value}})}/></label><label>Output Voltage<input value={assetForm.details.output_voltage} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,output_voltage:e.target.value}})}/></label><label>Max Current<input value={assetForm.details.max_current} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,max_current:e.target.value}})}/></label><label>Meter Serial Number<input value={assetForm.details.meter_serial} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,meter_serial:e.target.value}})}/></label><label>OCPP Version<input value={assetForm.details.ocpp_version} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,ocpp_version:e.target.value}})}/></label><label>Network Type<input value={assetForm.details.network_type} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,network_type:e.target.value}})}/></label></div>}
{assetForm.asset_type==='camera'&&<div><label>Resolution<input value={assetForm.details.camera_resolution} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,camera_resolution:e.target.value}})} placeholder="4MP"/></label><label>Lens<input value={assetForm.details.lens} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,lens:e.target.value}})}/></label><label>PoE<input value={assetForm.details.poe} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,poe:e.target.value}})}/></label></div>}
{assetForm.asset_type==='nvr'&&<div><label>Channels<input value={assetForm.details.nvr_channels} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,nvr_channels:e.target.value}})} placeholder="8"/></label><label>Storage Capacity<input value={assetForm.details.storage_capacity} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,storage_capacity:e.target.value}})}/></label><label>HDD Serial Number<input value={assetForm.details.hdd_serial} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,hdd_serial:e.target.value}})}/></label><label>HDD Count<input value={assetForm.details.hdd_count} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,hdd_count:e.target.value}})}/></label><label>PoE Ports<input value={assetForm.details.poe_ports} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,poe_ports:e.target.value}})}/></label><label>Connected Cameras<input value={assetForm.details.connected_cameras} onChange={e=>setAssetForm({...assetForm,details:{...assetForm.details,connected_cameras:e.target.value}})}/></label></div>}
<label style={{gridColumn:'1/-1'}}>Notes<textarea value={assetForm.notes} onChange={e=>setAssetForm({...assetForm,notes:e.target.value})} rows="3"/></label>
</div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setAssetModal(false)}>Cancel</button><button className="btn btn-primary" disabled={assetSaving}>{assetSaving?'Saving…':editingAsset?'Save Changes':'Add Asset'}</button></div></form></Modal>}
  {inventoryModal&&<Modal title={editingInventory?"Edit Billing Item":"Add Billing Item"} onClose={()=>setInventoryModal(false)}><form onSubmit={addInventory}><div className="form-grid modal-grid">
    <label>Item Name *<input autoFocus value={inventoryForm.product_name} onChange={e=>setInventoryForm({...inventoryForm,product_name:e.target.value})} placeholder="e.g. DC EV Charging"/></label>
    <label>HSN/SAC<input value="996749" readOnly/></label>
    <label>Unit<input value="KWH" readOnly/></label>
    <label>Purchase Price<input type="number" min="0" step="0.01" value={inventoryForm.purchase_price} onChange={e=>setInventoryForm({...inventoryForm,purchase_price:e.target.value})}/></label>
    <label>Selling Price / KWH *<input type="number" min="0" step="0.01" value={inventoryForm.selling_price} onChange={e=>setInventoryForm({...inventoryForm,selling_price:e.target.value})}/></label>
    <label>GST % *<input type="number" min="0" step="0.01" value={inventoryForm.gst_rate} onChange={e=>setInventoryForm({...inventoryForm,gst_rate:e.target.value})}/></label>
    <label>Notes<input value={inventoryForm.notes} onChange={e=>setInventoryForm({...inventoryForm,notes:e.target.value})}/></label>
   </div><p className="muted modal-note">EV charging is billed in kWh. HSN/SAC 996749 and unit KWH are fixed. Billing Items contain only billable charging-service information.</p><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setInventoryModal(false)}>Cancel</button><button className="btn btn-primary" disabled={inventorySaving}>{inventorySaving?'Saving…':editingInventory?'Save Changes':'Add Item'}</button></div></form></Modal>}
 </div>;
}
