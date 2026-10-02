import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
 const d=new jsPDF({unit:'mm',format:'a4'}),L=10,T=5,W=190,R=L+W;
 const BLUE=[182,221,232];
 const money2=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const money4=n=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:4,maximumFractionDigits:4});
 const safe=(v,f='')=>v===null||v===undefined||v===''?f:String(v);
 const company=inv.company_business_name?inv:(cfg||{});
 const addr=[company.company_address_line1||company.address_line1,company.company_address_line2||company.address_line2,company.company_city||company.city,company.company_state||company.state,company.company_pincode||company.pincode,company.company_country||company.country||'India'].filter(Boolean).join(', ');
 const buyerAddr=[inv.billing_address_line1,inv.billing_address_line2,inv.billing_city,inv.billing_state,inv.billing_pincode,inv.billing_country||'India'].filter(Boolean).join(', ');
 const stateName=safe(inv.place_of_supply)||safe(inv.billing_state),stateCode=safe(inv.place_of_supply_state_code||inv.billing_state_code);
 const isIgst=Number(inv.igst_amount||0)>0;
 const PAGE_BOTTOM=294;

 const border=()=>{d.setDrawColor(0);d.setLineWidth(.25);d.rect(L,T,W,PAGE_BOTTOM-T);};
 const header=()=>{
  d.setTextColor(0,0,0);d.setDrawColor(0);d.setLineWidth(.25);
  d.setFont('helvetica','bold');d.setFontSize(14);d.setTextColor(255,0,0);d.text('Tax Invoice',105,11,{align:'center'});
  d.setTextColor(0,0,0);d.setFontSize(16);d.text('M/s. '+(inv.company_business_name||cfg?.business_name||'TRIARC GROUP'),105,19,{align:'center'});
  d.setFont('helvetica','normal');d.setFontSize(8.5);
  if(addr)d.text(addr,105,25,{align:'center',maxWidth:184});
  d.setFont('helvetica','bold');d.setFontSize(9);d.text('GSTIN: '+(inv.company_gstin||cfg?.gstin||'36AAYFT2036P1ZB'),105,32,{align:'center'});
  d.line(L,37,R,37);
  d.setFont('helvetica','normal');d.setFontSize(8);
  d.text('Contact: '+(inv.company_phone||cfg?.phone||'+91 7993356677'),L+1,41);
  if(inv.company_email||cfg?.email)d.text('E-Mail: '+(inv.company_email||cfg.email),L+101,41);
  d.line(L,44,R,44);d.line(119,44,119,89);
  d.setFont('helvetica','bold');d.setFontSize(9);d.text('Buyer (Bill to)',L+1,49);
  d.setFontSize(9);d.text(safe(inv.billing_name),L+1,55);
  d.setFont('helvetica','normal');d.setFontSize(8);
  if(buyerAddr)d.text(buyerAddr,L+1,60,{maxWidth:103});
  if(inv.billing_state)d.text('State Name: '+inv.billing_state+'  Code: '+safe(inv.billing_state_code||stateCode),L+1,76);
  if(inv.billing_gstin)d.text('GSTIN/UIN: '+inv.billing_gstin,L+1,82);
  d.text('Place of Supply: '+stateName,L+1,88);
  d.setFont('helvetica','bold');d.text('Invoice Period :',120,49);d.setFont('helvetica','normal');d.text(fmtDate(inv.billing_period_from)+' - '+fmtDate(inv.billing_period_to),145,49);
  d.setFont('helvetica','bold');d.text('Invoice No :',120,55);d.setFont('helvetica','normal');d.text(safe(inv.invoice_number),141,55);
  d.setFont('helvetica','bold');d.text('Dated :',120,61);d.setFont('helvetica','normal');d.text(fmtDate(inv.invoice_date),141,61);
  d.setFont('helvetica','bold');d.text('Mode/Terms of Payment:',120,68);
  d.line(L,89,R,89);
  d.setFont('helvetica','bold');d.setFontSize(8);d.text('Station:',L+1,94);
  d.setFont('helvetica','italic');d.text(safe(inv.station),L+18,94);
  d.setFont('helvetica','bold').text('Period:',119,94);
  d.setFont('helvetica','normal').text(fmtDate(inv.billing_period_from)+' - '+fmtDate(inv.billing_period_to),136,94);
  d.line(L,98,R,98);
 };

 const startPage=(first=false)=>{
  if(!first)d.addPage();
  border();
  if(first)header();
 };
 startPage(true);

 const body=items.map((x,i)=>[
  i+1,safe(x.description)+' (HSN/SAC '+safe(x.hsn||'996749')+')',
  (+x.gst_rate||0)+'%',(+x.quantity).toFixed(4),Number(x.unit_price||0).toFixed(4),
  safe(x.unit||'UNT'),money2(x.taxable_amount)
 ]);

 autoTable(d,{
  startY:98,margin:{left:L,right:10,bottom:12},tableWidth:W,
  head:[['Sl No.','Description of Services','GST Rate','Quantity (kWh)','Rate (Rs.)','per','Amount (Rs.)']],
  body,theme:'grid',
  styles:{font:'helvetica',fontSize:7.1,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:.25,cellPadding:{top:1.4,right:1.2,bottom:1.4,left:1.2},valign:'middle',overflow:'linebreak',minCellHeight:9},
  headStyles:{fillColor:BLUE,textColor:[0,0,0],fontStyle:'bold',halign:'center',valign:'middle',minCellHeight:9},
  columnStyles:{
   0:{cellWidth:14,halign:'center'},1:{cellWidth:63.5,halign:'left'},
   2:{cellWidth:19,halign:'center'},3:{cellWidth:25.5,halign:'right'},
   4:{cellWidth:27,halign:'right'},5:{cellWidth:13,halign:'center'},6:{cellWidth:28,halign:'right'}
  },
  pageBreak:'auto',
  didDrawPage:()=>border()
 });

 let y=d.lastAutoTable.finalY;
 const subtotal=Number(inv.taxable_amount||0),round=Number(inv.round_off||0);
 const tax=Number(inv.total_tax||0),qty=items.reduce((n,x)=>n+(+x.quantity||0),0);
 const amountX=R-34.5;

 // If the service table reached a new page, keep the summary together.
 if(y+31>PAGE_BOTTOM-4){d.addPage();border();y=10;}
 d.setDrawColor(0);d.setTextColor(0,0,0);d.setLineWidth(.25);

 // Totals block — horizontal rules and right amount divider exactly define the block.
 d.line(L,y,R,y);
 d.line(amountX,y,amountX,y+24);
 d.setFont('helvetica','bold');d.setFontSize(7.5);
 d.text('Sub Total (Taxable Value)',amountX-2,y+5.2,{align:'right'});
 d.text(money2(subtotal),R-1,y+5.2,{align:'right'});
 d.line(L,y+8,R,y+8);
 d.setFont('helvetica','normal');
 d.text(isIgst?'IGST Output A/c @ '+(items[0]?.gst_rate||0)+'%':'CGST + SGST',amountX-2,y+13.2,{align:'right'});
 d.text(money2(isIgst?inv.igst_amount:(Number(inv.cgst_amount||0)+Number(inv.sgst_amount||0))),R-1,y+13.2,{align:'right'});
 d.line(L,y+16,R,y+16);
 d.text('Rounding Off',amountX-2,y+21.2,{align:'right'});
 d.text(money2(round),R-1,y+21.2,{align:'right'});
 d.line(L,y+24,R,y+24);

 // Total row.
 y+=24;
 d.setFillColor(...BLUE);d.rect(L,y,W,7,'F');
 d.setTextColor(0,0,0);d.setFont('helvetica','bold');d.setFontSize(7.5);
 d.text('Total',L+39,y+4.8);
 d.text(money4(qty),L+101,y+4.8,{align:'right'});
 d.text('Rs. '+money2(inv.grand_total),R-1,y+4.8,{align:'right'});
 d.line(L,y,R,y);d.line(L,y+7,R,y+7);d.line(amountX,y,amountX,y+7);

 // Amount in words — kept on its own row, immediately below Total, matching the reference.
 y+=14;
 d.setFont('helvetica','bold');d.setFontSize(9);
 d.text('Amount Chargeable (in words):',L+1,y);
 d.setFont('helvetica','normal');d.text(words(inv.grand_total)+' (E. & O.E.)',L+72,y,{maxWidth:116});

 // Tax analysis heading directly follows the amount-in-words row.
 y+=6;d.setFillColor(...BLUE);d.rect(L,y-2,W,6,'F');
 d.setTextColor(0,0,0);d.setFont('helvetica','bold');d.text('Tax Analysis',105,y+2,{align:'center'});y+=5;

 const groups={};
 items.forEach(x=>{
  const k=x.hsn||'996749';
  if(!groups[k])groups[k]={taxable:0,gst:+x.gst_rate||0};
  groups[k].taxable+=+x.taxable_amount||0;
 });

 if(isIgst){
  const rows=Object.entries(groups).map(([h,g])=>{
   const tx=g.taxable*g.gst/100;return[h,money2(g.taxable),g.gst+'%',money2(tx),money2(tx)];
  });
  rows.push(['Total',money2(subtotal),'',money2(tax),money2(tax)]);
  autoTable(d,{
   startY:y,margin:{left:L,right:10,bottom:12},tableWidth:W,
   head:[['HSN/SAC','Taxable Value','IGST Rate','IGST Amount','Total Tax Amount']],body:rows,theme:'grid',
   styles:{font:'helvetica',fontSize:7.1,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:.25,cellPadding:{top:1.3,right:1.2,bottom:1.3,left:1.2},valign:'middle',minCellHeight:8},
   headStyles:{fillColor:BLUE,textColor:[0,0,0],fontStyle:'bold',halign:'center',minCellHeight:8},
   columnStyles:{0:{cellWidth:70,halign:'center'},1:{cellWidth:35,halign:'right'},2:{cellWidth:27,halign:'center'},3:{cellWidth:28,halign:'right'},4:{cellWidth:30,halign:'right'}},
   didDrawPage:()=>border()
  });
 }else{
  const rows=Object.entries(groups).map(([h,g])=>{
   const tx=g.taxable*g.gst/100;return[h,money2(g.taxable),g.gst+'%',money2(tx/2),money2(tx/2),money2(tx)];
  });
  rows.push(['Total',money2(subtotal),'',money2(inv.cgst_amount),money2(inv.sgst_amount),money2(tax)]);
  autoTable(d,{
   startY:y,margin:{left:L,right:10,bottom:12},tableWidth:W,
   head:[['HSN/SAC','Taxable Value','GST Rate','CGST','SGST','Total Tax Amount']],body:rows,theme:'grid',
   styles:{font:'helvetica',fontSize:7.1,textColor:[0,0,0],lineColor:[0,0,0],lineWidth:.25,cellPadding:{top:1.3,right:1.2,bottom:1.3,left:1.2},valign:'middle',minCellHeight:8},
   headStyles:{fillColor:BLUE,textColor:[0,0,0],fontStyle:'bold',halign:'center',minCellHeight:8},
   columnStyles:{0:{cellWidth:56,halign:'center'},1:{cellWidth:32,halign:'right'},2:{cellWidth:25,halign:'center'},3:{cellWidth:23,halign:'right'},4:{cellWidth:23,halign:'right'},5:{cellWidth:31,halign:'right'}},
   didDrawPage:()=>border()
  });
 }

 y=d.lastAutoTable.finalY+5;
 if(y+18>PAGE_BOTTOM-8){d.addPage();border();y=15;}
 d.setFont('helvetica','bold');d.setFontSize(9);d.text('Tax Amount (in words):',L+1,y);
 d.setFont('helvetica','bold');d.text(words(tax),L+40,y,{maxWidth:145});
 y+=5;d.line(L,y,R,y);
 y+=5;d.setFont('helvetica','bold');d.setFontSize(9);d.text('Declaration',L+1,y);
 d.setFont('helvetica','italic');d.setFontSize(8);
 d.text('We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.',L+1,y+5,{maxWidth:165});

 // Fixed signature zone on the same page as declaration when possible.
 const sigY=Math.max(y+27,250);
 if(sigY+7>PAGE_BOTTOM-2){
  d.addPage();border();
  d.setFont('helvetica','normal');d.setFontSize(7.1);
  d.text("Customer's Seal and Signature",L+1,24);
  d.setFont('helvetica','bold');d.text('for M/s. '+(inv.company_business_name||cfg?.business_name||'TRIARC GROUP'),R-1,24,{align:'right'});
 }else{
  d.setFont('helvetica','normal');d.setFontSize(7.1);
  d.text("Customer's Seal and Signature",L+1,sigY);
  d.setFont('helvetica','bold');d.text('for M/s. '+(inv.company_business_name||cfg?.business_name||'TRIARC GROUP'),R-1,sigY,{align:'right'});
 }

 d.setFont('helvetica','normal');d.setFontSize(7.1);
 d.text('This is a Computer Generated Invoice',105,291,{align:'center'});
 d.setFont('helvetica','bold');d.text('Authorised Signatory',R-1,291,{align:'right'});
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
 const save=async()=>{if(!c)return toast.error('Select a customer.');if(!from||!to||new Date(from)>new Date(to))return toast.error('Enter a valid billing period.');if(!station.trim())return toast.error('Select the charging station.');if(!place.trim())return toast.error('Select the place of supply.');if(!items.length)return toast.error('Add at least one item.');setSaving(true);try{const invoiceNumber=editingInvoice?editingInvoice.invoice_number:(await supabase.rpc('next_billing_invoice_number',{p_series:series.trim()})).data;if(!invoiceNumber)throw new Error('Unable to determine invoice number.');const {data:u}=await supabase.auth.getUser();const base={invoice_number:invoiceNumber,invoice_series:editingInvoice?editingInvoice.invoice_series:series.trim(),invoice_date:editingInvoice?editingInvoice.invoice_date:new Date().toISOString().slice(0,10),customer_id:c.id,billing_name:c.name,billing_gstin:c.gstin||null,billing_pan:c.pan||null,billing_address_line1:c.billing_address_line1,billing_address_line2:c.billing_address_line2,billing_city:c.billing_city,billing_state:c.billing_state,billing_state_code:c.billing_state_code,billing_pincode:c.billing_pincode,billing_country:c.billing_country||'India',place_of_supply:place.trim(),place_of_supply_state_code:placeCode||c.customer_state_code||gstState(c.gstin),station:station.trim(),billing_period_from:from,billing_period_to:to,subtotal:total.taxable,discount_total:0,taxable_amount:total.taxable,cgst_amount:total.cgst,sgst_amount:total.sgst,igst_amount:total.igst,cess_amount:0,total_tax:total.tax,round_off:total.round,grand_total:total.total,invoice_status:'issued'};if(!editingInvoice){base.company_business_name=settings?.business_name||null;base.company_legal_name=settings?.legal_name||null;base.company_gstin=settings?.gstin||null;base.company_pan=settings?.pan||null;base.company_address_line1=settings?.address_line1||null;base.company_address_line2=settings?.address_line2||null;base.company_city=settings?.city||null;base.company_state=settings?.state||null;base.company_state_code=settings?.state_code||null;base.company_pincode=settings?.pincode||null;base.company_country=settings?.country||'India';base.company_phone=settings?.phone||null;base.company_email=settings?.email||null;base.company_website=settings?.website||null;base.created_by=u.user?.id||null;}const {data:inv,error:ie}=editingInvoice?await supabase.from('billing_invoices').update(base).eq('id',editingInvoice.id).select().single():await supabase.from('billing_invoices').insert({...base,created_by:u.user?.id||null}).select().single();if(ie)throw ie;const rows=total.rows.map(x=>({invoice_id:inv.id,inventory_id:x.inventory_id,description:x.description,hsn:x.hsn||null,unit:x.unit,quantity:+x.quantity,unit_price:+x.unit_price,discount_percent:+x.discount_percent||0,discount_amount:x.discount_amount,taxable_amount:x.taxable_amount,gst_rate:+x.gst_rate,cgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,cgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,sgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,sgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,igst_rate:taxType==='IGST'?+x.gst_rate:0,igst_amount:taxType==='IGST'?x.taxable_amount*+x.gst_rate/100:0,cess_rate:0,cess_amount:0,line_total:x.line_total,tax_type:taxType}));if(editingInvoice){const {error:de}=await supabase.from('billing_items').delete().eq('invoice_id',inv.id);if(de)throw de;}const {data:saved,error:se}=await supabase.from('billing_items').insert(rows).select();if(se)throw se;setInvoices(x=>[inv,...x.filter(r=>r.id!==inv.id)]);setItems([]);setCustomer('');setStation('');setPlace('');setPlaceCode('');setFrom('');setTo('');setEditingInvoice(null);setTab('invoices');toast.success(editingInvoice?'EV Billing invoice updated':'EV Billing invoice created');pdf(inv,saved,settings).save(inv.invoice_number+'.pdf');}catch(e){toast.error(e.message||'Invoice save failed')}finally{setSaving(false)}};
 const download=async inv=>{const [{data:i,error:ie}]=await Promise.all([supabase.from('billing_items').select('*').eq('invoice_id',inv.id).order('created_at')]);if(ie)return toast.error(ie.message);pdf(inv,i,settings).save(inv.invoice_number+'.pdf')};
 const deleteInvoice=async inv=>{if(!window.confirm('Delete invoice '+inv.invoice_number+'? Its invoice items will also be deleted.'))return;const {error}=await supabase.from('billing_invoices').delete().eq('id',inv.id);if(error)return toast.error(error.message);setInvoices(x=>x.filter(r=>r.id!==inv.id));toast.success('Invoice deleted')};
 const deleteCustomer=async row=>{if(!window.confirm('Delete customer '+row.name+'?'))return;const {count,error:ce}=await supabase.from('billing_invoices').select('id',{count:'exact',head:true}).eq('customer_id',row.id);if(ce)return toast.error(ce.message);if(count)return toast.error('Customer cannot be deleted because invoices exist for this customer.');const {error}=await supabase.from('billing_customers').delete().eq('id',row.id);if(error)return toast.error(error.message);setCustomers(x=>x.filter(r=>r.id!==row.id));toast.success('Customer deleted')};
 const deleteInventory=async row=>{if(!window.confirm('Delete billing item '+row.product_name+'?'))return;const {count,error:ce}=await supabase.from('billing_items').select('id',{count:'exact',head:true}).eq('inventory_id',row.id);if(ce)return toast.error(ce.message);if(count)return toast.error('Billing item cannot be deleted because it is used on invoices. Deactivate it instead.');const {error}=await supabase.from('billing_inventory').delete().eq('id',row.id);if(error)return toast.error(error.message);setInventory(x=>x.filter(r=>r.id!==row.id));toast.success('Charging item deleted')};

 return <div className="page-container">
  <div className="page-header"><div><h1>EV Billing</h1><p>Triarc EV charging tax invoices</p></div><div><button className="btn btn-secondary" onClick={()=>load()}><RefreshCw size={14}/> Refresh</button> <button className="btn btn-primary" onClick={()=>setTab('new')}><Plus size={14}/> New EV Billing</button></div></div>
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
