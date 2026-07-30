"use client";

import { useEffect, useState } from "react";
import { fetchErrorLogs } from "../api";
import { pageSize } from "@/utils/constants";


interface Props{
 apiSession:any;
 page:number;
 appliedQuery:string;
 level:string;
 source:string;
 category:string;
 resolved:string;
 refreshKey:number;
}


export function useErrorLogsData({
 apiSession,
 page,
 appliedQuery,
 level,
 source,
 category,
 resolved,
 refreshKey
}:Props){


 const [rows,setRows]=useState<any[]>([]);
 const [total,setTotal]=useState(0);

 const [summary,setSummary]=useState({
    errors:0,
    warnings:0,
    permission:0
 });


 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");



 useEffect(()=>{

 if(!apiSession) return;


 let active=true;


 async function load(){

   setLoading(true);

   try{

    const params=new URLSearchParams({
      limit:String(pageSize),
      offset:String((page-1)*pageSize)
    });


    if(appliedQuery)
      params.set("q",appliedQuery);


    if(level!=="all")
      params.set("level",level);


    if(source!=="all")
      params.set("source",source);


    if(category!=="all")
      params.set("category",category);


    if(resolved!=="all")
      params.set(
        "resolved",
        String(resolved==="resolved")
      );


    if(apiSession.user?.is_super_admin)
      params.set(
        "include_global",
        "true"
      );


    const response =
      await fetchErrorLogs(
        params,
        apiSession
      );


    if(!active) return;


    setRows(response?.items || []);

    setTotal(
      Number(response?.total || 0)
    );


    setSummary({
      errors:Number(response?.summary?.errors || 0),
      warnings:Number(response?.summary?.warnings || 0),
      permission:Number(
        response?.summary?.permission_issues || 0
      )
    });


   }
   catch(err:any){

    setError(
      err.message ||
      "Could not load error logs"
    );

   }
   finally{
     setLoading(false);
   }

 }


 load();


 return ()=>{
   active=false;
 }


 },[
 apiSession?.tenantId,
 page,
 appliedQuery,
 level,
 source,
 category,
 resolved,
 refreshKey
 ]);


 return {
   rows,
   total,
   summary,
   loading,
   error
 };

}
