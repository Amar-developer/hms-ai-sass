import { apiFetch } from "@/lib/api";


export async function fetchErrorLogs(
  params: URLSearchParams,
  apiSession:any
) {

  return apiFetch(
    `/error-logs?${params}`,
    apiSession
  );

}



export async function updateErrorLog(
  id:string,
  payload:any,
  apiSession:any
){

 return apiFetch(
   `/error-logs/${id}`,
   apiSession,
   {
     method:"PATCH",
     body:JSON.stringify(payload)
   }
 );

}



export async function deleteErrorLog(
 id:string,
 apiSession:any
){

 return apiFetch(
   `/error-logs/${id}`,
   apiSession,
   {
    method:"DELETE"
   }
 );

}
