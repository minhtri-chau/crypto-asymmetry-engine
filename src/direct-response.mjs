export async function readDirectResponse(response){
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{}
 if(!response.ok){const detail=data?.error||text.trim().slice(0,240)||"Empty server response";throw new Error(`Direct collection HTTP ${response.status}: ${detail}`)}
 if(!data?.intelligence)throw new Error("Direct collection returned an invalid response; saved evidence was kept.");return data;
}
