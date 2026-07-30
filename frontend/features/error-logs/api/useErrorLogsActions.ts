"use client";

import { useState } from "react";
import {
 updateErrorLog,
 deleteErrorLog
} from "../api";


export function useErrorLogsActions(
 apiSession:any
){

const [busy,setBusy]=useState("");

const [message,setMessage]=useState("");



async function resolve(
 selected:any,
 nextResolved:boolean,
 resolutionNote:string
){

 setBusy("resolve");

 try{

  const updated =
   await updateErrorLog(
     selected.id,
     {
       resolved:nextResolved,
       resolution_note:
        resolutionNote || null
     },
     apiSession
   );


  setMessage(
    nextResolved
    ? "Error log resolved."
    : "Error log reopened."
  );


  return updated;


 }
 finally{
   setBusy("");
 }

}



async function remove(
 selected:any
){

 setBusy("delete");

 try{

 await deleteErrorLog(
   selected.id,
   apiSession
 );


 setMessage(
   "Error log deleted."
 );


 }
 finally{
  setBusy("");
 }

}


return {
 resolve,
 remove,
 busy,
 message,
 setMessage
};


}
