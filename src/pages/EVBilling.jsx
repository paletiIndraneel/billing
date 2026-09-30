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
 const d=new jsPDF({unit:'mm',format:'a4'}),L=10,W=190,bg=[220,237,247];
 d.rect(L,8,W,281);d.setFillColor(...bg);d.rect(L,8,W,13,'F');d.setFont('helvetica','bold');d.setFontSize(15);d.text('Tax Invoice',105,16.5,{align:'center'});
 d.setFontSize(11);d.text(cfg?.business_name||'M/S. TRIARC GROUP',L+3,28);d.setFont('helvetica','normal');d.setFontSize(8);
 d.text([cfg?.address_line1,cfg?.address_line2,cfg?.city,cfg?.state,cfg?.pincode].filter(Boolean).join(', '),L+3,33);
 d.text('GSTIN: '+(cfg?.gstin||'36AAYFT2036P1ZB'),L+3,38);d.text('Contact: '+(cfg?.phone||'+91 7993356677'),L+3,42);
 d.setFont('helvetica','bold');d.text('Invoice No.',130,28);d.setFont('helvetica','normal');d.text(inv.invoice_number,160,28);
 d.setFont('helvetica','bold');d.text('Date',130,33);d.setFont('helvetica','normal');d.text(fmtDate(inv.invoice_date),160,33);
 d.setFont('helvetica','bold');d.text('Station',130,38);d.setFont('helvetica','normal');d.text(inv.station||'-',160,38);
 d.setFillColor(...bg);d.rect(L,47,W,7,'F');d.setFont('helvetica','bold');d.text('Buyer Details',L+3,52);
 d.setFontSize(8.5);d.text(inv.billing_name||'-',L+3,61);d.setFont('helvetica','normal');if(inv.billing_gstin)d.text('GSTIN: '+inv.billing_gstin,L+3,65.5);
 d.text([inv.billing_address_line1,inv.billing_address_line2,inv.billing_city,inv.billing_state,inv.billing_pincode].filter(Boolean).join(', '),L+3,70);
 d.setFont('helvetica','bold');d.text('Place of Supply:',125,61);d.setFont('helvetica','normal');d.text((inv.place_of_supply||'-')+(inv.place_of_supply_state_code?' ('+inv.place_of_supply_state_code+')':''),154,61);
 d.setFillColor(...bg);d.rect(L,76,W,7,'F');d.setFont('helvetica','bold');d.text('Billing Details',L+3,81);
 d.setFont('helvetica','normal');d.text('Station: '+(inv.station||'-'),L+3,89);d.text('Billing Period: '+fmtDate(inv.billing_period_from)+' - '+fmtDate(inv.billing_period_to),105,89);
 autoTable(d,{startY:93,margin:{left:L,right:10},head:[['Sr.','Description','HSN/SAC','Qty','Unit','Rate','GST%','Amount']],body:items.map((x,i)=>[i+1,x.description,x.hsn||'-',(+x.quantity).toFixed(3),x.unit||'PCS',money(x.unit_price),(+x.gst_rate||0)+'%',money(x.line_total)]),theme:'grid',styles:{fontSize:7.5,lineColor:[25,25,25],lineWidth:.25,cellPadding:2},headStyles:{fillColor:bg,textColor:[0,0,0]},columnStyles:{0:{cellWidth:9,halign:'center'},2:{cellWidth:18},3:{cellWidth:16,halign:'right'},4:{cellWidth:13},5:{cellWidth:23,halign:'right'},6:{cellWidth:15,halign:'center'},7:{cellWidth:27,halign:'right'}}});
 let y=d.lastAutoTable.finalY+5;d.setFont('helvetica','bold');d.setFontSize(8.5);d.text('Taxable Value',145,y);d.text(money(inv.taxable_amount),197,y,{align:'right'});y+=4.5;
 if(inv.igst_amount){d.text('IGST',145,y);d.text(money(inv.igst_amount),197,y,{align:'right'});y+=4.5}else{d.text('CGST',145,y);d.text(money(inv.cgst_amount),197,y,{align:'right'});y+=4.5;d.text('SGST',145,y);d.text(money(inv.sgst_amount),197,y,{align:'right'});y+=4.5}
 d.text('Round Off',145,y);d.text(money(inv.round_off),197,y,{align:'right'});y+=5;d.setFillColor(...bg);d.rect(137,y-1,60,8,'F');d.text('Total',145,y+4);d.text(money(inv.grand_total),197,y+4,{align:'right'});y+=13;
 d.setFontSize(8);d.text('Amount in Words:',L+3,y);d.setFont('helvetica','normal');d.text(words(inv.grand_total),L+35,y);y+=7;
 d.setFillColor(...bg);d.rect(L,y,W,7,'F');d.setFont('helvetica','bold');d.text('Tax Analysis',L+3,y+4.8);y+=7;
 const groups={};items.forEach(x=>{const k=x.hsn||'-';groups[k]??={taxable:0,gst:+x.gst_rate||0};groups[k].taxable+=+x.taxable_amount||0});
 const ig=!!inv.igst_amount;
 autoTable(d,{startY:y,margin:{left:L,right:10},head:[['HSN/SAC','Taxable Value','GST Rate','CGST','SGST','IGST','Total Tax']],body:Object.entries(groups).map(([h,g])=>{const tx=g.taxable*g.gst/100;return[h,money(g.taxable),g.gst+'%',ig?'-':money(tx/2),ig?'-':money(tx/2),ig?money(tx):'-',money(tx)]}),theme:'grid',styles:{fontSize:7.2,lineColor:[25,25,25],lineWidth:.25},headStyles:{fillColor:bg,textColor:[0,0,0]}});
 y=d.lastAutoTable.finalY+7;d.setFont('helvetica','bold');d.text('Declaration',L+3,y);d.setFont('helvetica','normal');d.setFontSize(7.5);d.text('This is a computer generated invoice. All particulars are as stated above.',L+3,y+4.5);d.setFont('helvetica','bold');d.text('Authorised Signatory',165,y+18,{align:'center'});d.setFontSize(7);d.setFont('helvetica','normal');d.text('This is a Computer Generated Invoice',105,285,{align:'center'});return d;
}

function Modal({title,children,onClose}){
 return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>;
}

export default function EVBilling(){
 const toast=useToast(),[tab,setTab]=useState('invoices'),[customers,setCustomers]=useState([]),[inventory,setInventory]=useState([]),[invoices,setInvoices]=useState([]),[settings,setSettings]=useState(null);
 const [customer,setCustomer]=useState(''),[series,setSeries]=useState('GST-26/27'),[station,setStation]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[manualTax,setManualTax]=useState('CGST_SGST'),[items,setItems]=useState([]),[saving,setSaving]=useState(false);
 const [customerModal,setCustomerModal]=useState(false),[inventoryModal,setInventoryModal]=useState(false),[customerSaving,setCustomerSaving]=useState(false),[inventorySaving,setInventorySaving]=useState(false);
 const [customerForm,setCustomerForm]=useState({name:'',gstin:'',pan:'',billing_address_line1:'',billing_city:'',billing_state:'',billing_pincode:'',place_of_supply:'',customer_state_code:''});
 const [inventoryForm,setInventoryForm]=useState({product_name:'DC EV Charging',hsn:'996749',unit:'KWH',selling_price:'',gst_rate:'18',inventory_type:'electricity'});
 const load=async()=>{const [a,b,c,s]=await Promise.all([supabase.from('billing_customers').select('*').eq('active',true).order('name'),supabase.from('billing_invoices').select('*').order('invoice_date',{ascending:false}),supabase.from('inventory').select('*').eq('active',true).eq('inventory_type','electricity').order('product_name'),supabase.from('billing_settings').select('*').limit(1).maybeSingle()]);const e=[a,b,c,s].find(x=>x.error);if(e)throw e.error;setCustomers(a.data||[]);setInvoices(b.data||[]);setInventory(c.data||[]);setSettings(s.data)};

 useEffect(()=>{load().catch(e=>toast.error(e.message))},[]);

 const c=customers.find(x=>x.id===customer),auto=gstState(c?.gstin),taxType=auto?(auto===TRIARC_STATE?'CGST_SGST':'IGST'):manualTax,total=useMemo(()=>calc(items,taxType),[items,taxType]);
 const add=()=>{const p=inventory[0];if(!p)return toast.error('Add an inventory item first.');setItems(x=>[...x,{inventory_id:p.id,description:p.product_name,hsn:p.hsn||'',unit:p.unit||'PCS',quantity:1,unit_price:+p.selling_price||0,gst_rate:+p.gst_rate||0,discount_percent:0}])};
 const pick=(i,id)=>{const p=inventory.find(x=>x.id===id);if(!p)return;setItems(x=>x.map((r,n)=>n===i?{...r,inventory_id:p.id,description:p.product_name,hsn:p.hsn||'',unit:p.unit||'PCS',unit_price:+p.selling_price||0,gst_rate:+p.gst_rate||0}:r))};

 const addCustomer=async e=>{
   e.preventDefault();
   if(!customerForm.name.trim())return toast.error('Enter customer name.');
   if(customerForm.gstin && !/^\d{15}$/.test(customerForm.gstin.trim()))return toast.error('GSTIN must be 15 characters.');
   setCustomerSaving(true);
   try{
     const payload={type:'business',name:customerForm.name.trim(),gstin:customerForm.gstin.trim()||null,pan:customerForm.pan.trim()||null,billing_address_line1:customerForm.billing_address_line1.trim()||null,billing_city:customerForm.billing_city.trim()||null,billing_state:customerForm.billing_state.trim()||null,billing_pincode:customerForm.billing_pincode.trim()||null,place_of_supply:customerForm.place_of_supply.trim()||customerForm.billing_state.trim()||null,customer_state_code:customerForm.customer_state_code.trim()||gstState(customerForm.gstin),active:true};
     const {data,error}=await supabase.from('billing_customers').insert(payload).select().single();if(error)throw error;
     setCustomers(x=>[...x,data].sort((a,b)=>a.name.localeCompare(b.name)));setCustomer(data.id);setCustomerModal(false);setCustomerForm({name:'',gstin:'',pan:'',billing_address_line1:'',billing_city:'',billing_state:'',billing_pincode:'',place_of_supply:'',customer_state_code:''});toast.success('Customer added');
   }catch(e){toast.error(e.message||'Customer creation failed')}finally{setCustomerSaving(false)}
 };

 const addInventory=async e=>{
   e.preventDefault();
   if(!inventoryForm.product_name.trim())return toast.error('Enter item name.');
   if(!inventoryForm.selling_price || +inventoryForm.selling_price<0)return toast.error('Enter a valid rate.');
   if(inventoryForm.gst_rate==='' || +inventoryForm.gst_rate<0)return toast.error('Enter a valid GST rate.');
   setInventorySaving(true);
   try{
     const payload={product_name:inventoryForm.product_name.trim(),hsn:inventoryForm.hsn.trim()||null,unit:inventoryForm.unit.trim()||'KWH',selling_price:+inventoryForm.selling_price,gst_rate:+inventoryForm.gst_rate,inventory_type:'electricity',stock_tracked:false,active:true};
     const {data,error}=await supabase.from('inventory').insert(payload).select().single();if(error)throw error;
     setInventory(x=>[...x,data].sort((a,b)=>a.product_name.localeCompare(b.product_name)));setInventoryModal(false);setInventoryForm({product_name:'DC EV Charging',hsn:'996749',unit:'KWH',selling_price:'',gst_rate:'18',inventory_type:'electricity'});toast.success('Charging item added');
     if(!items.length)setItems([{inventory_id:data.id,description:data.product_name,hsn:data.hsn||'',unit:data.unit||'KWH',quantity:1,unit_price:+data.selling_price||0,gst_rate:+data.gst_rate||0,discount_percent:0}]);
   }catch(e){toast.error(e.message||'Inventory item creation failed')}finally{setInventorySaving(false)}
 };

 const save=async()=>{
   if(!c)return toast.error('Select a customer.');if(!from||!to||new Date(from)>new Date(to))return toast.error('Enter a valid billing period.');if(!station.trim())return toast.error('Enter the charging station.');if(!items.length)return toast.error('Add at least one item.');setSaving(true);
   try{
     const {data:num,error:ne}=await supabase.rpc('next_billing_invoice_number',{p_series:series.trim()});if(ne)throw ne;const {data:u}=await supabase.auth.getUser();
     const p={invoice_number:num,invoice_series:series.trim(),invoice_date:new Date().toISOString().slice(0,10),customer_id:c.id,billing_name:c.name,billing_gstin:c.gstin||null,billing_pan:c.pan||null,billing_address_line1:c.billing_address_line1,billing_address_line2:c.billing_address_line2,billing_city:c.billing_city,billing_state:c.billing_state,billing_state_code:c.billing_state_code,billing_pincode:c.billing_pincode,billing_country:c.billing_country||'India',place_of_supply:c.place_of_supply||c.billing_state||'',place_of_supply_state_code:c.customer_state_code||gstState(c.gstin),station:station.trim(),billing_period_from:from,billing_period_to:to,subtotal:total.taxable,discount_total:0,taxable_amount:total.taxable,cgst_amount:total.cgst,sgst_amount:total.sgst,igst_amount:total.igst,cess_amount:0,total_tax:total.tax,round_off:total.round,grand_total:total.total,invoice_status:'issued',created_by:u.user?.id||null};
     const {data:inv,error:ie}=await supabase.from('billing_invoices').insert(p).select().single();if(ie)throw ie;
     const rows=total.rows.map(x=>({invoice_id:inv.id,inventory_id:x.inventory_id,description:x.description,hsn:x.hsn||null,unit:x.unit,quantity:+x.quantity,unit_price:+x.unit_price,discount_percent:+x.discount_percent||0,discount_amount:x.discount_amount,taxable_amount:x.taxable_amount,gst_rate:+x.gst_rate,cgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,cgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,sgst_rate:taxType==='CGST_SGST'?+x.gst_rate/2:0,sgst_amount:taxType==='CGST_SGST'?x.taxable_amount*+x.gst_rate/200:0,igst_rate:taxType==='IGST'?+x.gst_rate:0,igst_amount:taxType==='IGST'?x.taxable_amount*+x.gst_rate/100:0,cess_rate:0,cess_amount:0,line_total:x.line_total,tax_type:taxType}));
     const {data:saved,error:se}=await supabase.from('billing_invoice_items').insert(rows).select();if(se)throw se;setInvoices(x=>[inv,...x]);setItems([]);setCustomer('');setStation('');setFrom('');setTo('');setTab('invoices');toast.success('EV Billing invoice created');pdf(inv,saved,settings).save(inv.invoice_number+'.pdf');
   }catch(e){toast.error(e.message||'Invoice creation failed')}finally{setSaving(false)}
 };
 const download=async inv=>{const [{data:i,error:ie}]=await Promise.all([supabase.from('billing_invoice_items').select('*').eq('invoice_id',inv.id).order('created_at')]);if(ie)return toast.error(ie.message);pdf(inv,i,settings).save(inv.invoice_number+'.pdf')};

 return <div className="page-container">
  <div className="page-header"><div><h1>EV Billing</h1><p>Triarc EV charging tax invoices</p></div><div><button className="btn btn-secondary" onClick={()=>load()}><RefreshCw size={14}/> Refresh</button> <button className="btn btn-primary" onClick={()=>setTab('new')}><Plus size={14}/> New EV Billing</button></div></div>
  <div className="tabs"><button className={tab==='invoices'?'tab active':'tab'} onClick={()=>setTab('invoices')}>Invoices</button><button className={tab==='new'?'tab active':'tab'} onClick={()=>setTab('new')}>New Invoice</button></div>
  {tab==='invoices'&&<div className="card"><div className="table-container"><table><thead><tr><th>Invoice No.</th><th>Date</th><th>Customer</th><th>Place of Supply</th><th>Station</th><th>Total</th><th></th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{i.invoice_number}</td><td>{fmtDate(i.invoice_date)}</td><td>{i.billing_name}</td><td>{i.place_of_supply||'-'}</td><td>{i.station||'-'}</td><td>₹{money(i.grand_total)}</td><td><button className="btn btn-secondary" onClick={()=>download(i)}><Download size={14}/> PDF</button></td></tr>)}{!invoices.length&&<tr><td colSpan="7">No EV invoices yet.</td></tr>}</tbody></table></div></div>}
  {tab==='new'&&<div className="card">
   <h2>New EV Billing Invoice</h2>
   <div className="form-grid">
    <label>Customer<div className="field-with-action"><select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Select customer</option>{customers.map(x=><option value={x.id} key={x.id}>{x.name}{x.gstin?' — '+x.gstin:''}</option>)}</select><button type="button" className="btn btn-secondary" title="Add customer" onClick={()=>setCustomerModal(true)}><Plus size={14}/></button></div></label>
    <label>Invoice Series<input value={series} onChange={e=>setSeries(e.target.value)}/></label>
    <label>Station<input value={station} onChange={e=>setStation(e.target.value)} placeholder="Triarc EV Hub | Bhadrachalam"/></label>
    <label>Place of Supply<input value={c?.place_of_supply||c?.billing_state||''} readOnly/></label>
    <label>Billing Period From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Billing Period To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label>GST Type{auto?<input value={auto===TRIARC_STATE?'CGST + SGST':'IGST'} readOnly/>:<select value={manualTax} onChange={e=>setManualTax(e.target.value)}><option value="CGST_SGST">CGST + SGST</option><option value="IGST">IGST</option></select>}</label>
   </div>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:20}}><h3>Charging Items</h3><button className="btn btn-secondary" onClick={()=>inventory.length?add():setInventoryModal(true)}><Plus size={14}/> Add Item</button></div>
   <div className="table-container"><table><thead><tr><th>Item</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST%</th><th></th></tr></thead><tbody>{items.map((x,i)=><tr key={i}><td><select value={x.inventory_id} onChange={e=>pick(i,e.target.value)}>{inventory.map(p=><option key={p.id} value={p.id}>{p.product_name}</option>)}</select></td><td>{x.hsn||'-'}</td><td><input type="number" min="0" step="0.001" value={x.quantity} onChange={e=>setItems(r=>r.map((z,n)=>n===i?{...z,quantity:e.target.value}:z))}/></td><td>{x.unit}</td><td><input type="number" min="0" step="0.01" value={x.unit_price} onChange={e=>setItems(r=>r.map((z,n)=>n===i?{...z,unit_price:e.target.value}:z))}/></td><td>{x.gst_rate}%</td><td><button className="btn btn-secondary" onClick={()=>setItems(r=>r.filter((_,n)=>n!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
   <div style={{maxWidth:320,marginLeft:'auto',marginTop:16}}><div className="summary-row"><span>Taxable Amount</span><b>₹{money(total.taxable)}</b></div>{taxType==='IGST'?<div className="summary-row"><span>IGST</span><b>₹{money(total.igst)}</b></div>:<><div className="summary-row"><span>CGST</span><b>₹{money(total.cgst)}</b></div><div className="summary-row"><span>SGST</span><b>₹{money(total.sgst)}</b></div></>}<div className="summary-row"><span>Round Off</span><b>₹{money(total.round)}</b></div><div className="summary-row total"><span>Total</span><b>₹{money(total.total)}</b></div></div>
   <div style={{textAlign:'right',marginTop:16}}><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Creating…':'Create EV Billing Invoice'}</button></div>
  </div>}
  {customerModal&&<Modal title="Add Customer" onClose={()=>setCustomerModal(false)}><form onSubmit={addCustomer}><div className="form-grid modal-grid">
    <label>Customer Name *<input autoFocus value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></label>
    <label>GSTIN<input maxLength="15" value={customerForm.gstin} onChange={e=>setCustomerForm({...customerForm,gstin:e.target.value.toUpperCase()})}/></label>
    <label>PAN<input maxLength="10" value={customerForm.pan} onChange={e=>setCustomerForm({...customerForm,pan:e.target.value.toUpperCase()})}/></label>
    <label>Billing Address<input value={customerForm.billing_address_line1} onChange={e=>setCustomerForm({...customerForm,billing_address_line1:e.target.value})}/></label>
    <label>City<input value={customerForm.billing_city} onChange={e=>setCustomerForm({...customerForm,billing_city:e.target.value})}/></label>
    <label>State<input value={customerForm.billing_state} onChange={e=>setCustomerForm({...customerForm,billing_state:e.target.value})}/></label>
    <label>Pincode<input value={customerForm.billing_pincode} onChange={e=>setCustomerForm({...customerForm,billing_pincode:e.target.value})}/></label>
    <label>Place of Supply<input value={customerForm.place_of_supply} onChange={e=>setCustomerForm({...customerForm,place_of_supply:e.target.value})} placeholder="Kerala"/></label>
    <label>State Code<input maxLength="2" value={customerForm.customer_state_code} onChange={e=>setCustomerForm({...customerForm,customer_state_code:e.target.value.replace(/\D/g,'').slice(0,2)})} placeholder="32"/></label>
   </div><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setCustomerModal(false)}>Cancel</button><button className="btn btn-primary" disabled={customerSaving}>{customerSaving?'Saving…':'Add Customer'}</button></div></form></Modal>}
  {inventoryModal&&<Modal title="Add Charging Item" onClose={()=>setInventoryModal(false)}><form onSubmit={addInventory}><div className="form-grid modal-grid">
    <label>Charging Service *<select autoFocus value={inventoryForm.product_name} onChange={e=>setInventoryForm({...inventoryForm,product_name:e.target.value})}><option value="DC EV Charging">DC EV Charging</option><option value="AC EV Charging">AC EV Charging</option></select></label>
    <label>HSN/SAC<input value="996749" readOnly/></label>
    <label>Unit<input value="KWH" readOnly/></label>
    <label>Rate per Unit *<input type="number" min="0" step="0.01" value={inventoryForm.selling_price} onChange={e=>setInventoryForm({...inventoryForm,selling_price:e.target.value})}/></label>
    <label>GST % *<input type="number" min="0" step="0.01" value={inventoryForm.gst_rate} onChange={e=>setInventoryForm({...inventoryForm,gst_rate:e.target.value})}/></label>
   </div><p className="muted modal-note">EV charging is billed in kWh. HSN/SAC 996749 and unit KWH are fixed for these charging services. The GST rate is saved with the service and inherited automatically when billing.</p><div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={()=>setInventoryModal(false)}>Cancel</button><button className="btn btn-primary" disabled={inventorySaving}>{inventorySaving?'Saving…':'Add Item'}</button></div></form></Modal>}
 </div>;
}
