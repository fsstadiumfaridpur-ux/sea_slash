import {roundMoney} from './money';
export interface InvestmentInvestor {id:string;name:string;share:number;openingPaid:number}
export interface InvestmentContribution {id:string;investorId:string;date:string;amount:number;note:string}
export interface InvestmentFunding {target:number|null;investors:InvestmentInvestor[];payments:InvestmentContribution[]}
export function validateInvestmentFunding(funding:InvestmentFunding){
 const money=(value:number)=>Number.isFinite(value)&&value>=0&&value<=1e12&&roundMoney(value)===value;
 if(!funding||!(funding.target===null||money(funding.target))||!Array.isArray(funding.investors)||funding.investors.length<2||funding.investors.length>10||!Array.isArray(funding.payments))throw new Error('Enter a valid investment budget and at least two investors.');
 const ids=new Set<string>();let shares=0;
 for(const investor of funding.investors){if(!investor.id||ids.has(investor.id)||!investor.name?.trim()||investor.name.length>100||!money(investor.openingPaid)||!Number.isFinite(investor.share)||investor.share<=0||investor.share>100||roundMoney(investor.share)!==investor.share)throw new Error('Enter a name, opening contribution and share for each investor.');ids.add(investor.id);shares+=investor.share;}
 if(roundMoney(shares)!==100)throw new Error('Investor shares must total 100%.');
 const payments=new Set<string>();
 for(const payment of funding.payments){if(!payment.id||payments.has(payment.id)||!ids.has(payment.investorId)||!money(payment.amount)||payment.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(payment.date)||!Number.isFinite(Date.parse(payment.date))||new Date(payment.date).toISOString().slice(0,10)!==payment.date||typeof payment.note!=='string'||payment.note.length>500)throw new Error('Enter a valid contribution date, investor and amount.');payments.add(payment.id);}
}
export function investmentFundingSummary(funding:InvestmentFunding,costs:number){
 validateInvestmentFunding(funding);
 const paid=funding.investors.map(investor=>roundMoney(investor.openingPaid+funding.payments.filter(payment=>payment.investorId===investor.id).reduce((sum,payment)=>sum+payment.amount,0)));
 const totalPaid=roundMoney(paid.reduce((sum,amount)=>sum+amount,0));
 const balancedMinimum=Math.ceil((Math.max(roundMoney(costs),totalPaid,...paid.map((amount,index)=>amount*100/funding.investors[index].share))-1e-8)*100)/100;
 const basis=funding.target??balancedMinimum;let allocated=0;
 const investors=funding.investors.map((investor,index)=>{const required=index===funding.investors.length-1?roundMoney(basis-allocated):roundMoney(basis*investor.share/100);allocated=roundMoney(allocated+required);return {...investor,paid:paid[index],required,due:Math.max(0,roundMoney(required-paid[index])),overpaid:Math.max(0,roundMoney(paid[index]-required))};});
 return {totalPaid,basis,investors,outstanding:roundMoney(investors.reduce((sum,investor)=>sum+investor.due,0))};
}
