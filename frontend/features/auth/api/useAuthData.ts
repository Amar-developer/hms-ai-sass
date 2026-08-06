"use client";

import { useState } from "react";
import { changePassword } from "../api";


export function useChangePassword(
  apiSession:any
){

  const [busy,setBusy] = useState(false);

  const [message,setMessage] = useState("");

  const [error,setError] = useState("");



  async function submitPassword(payload:{
    currentPassword:string;
    newPassword:string;
  }){

    setMessage("");
    setError("");

    setBusy(true);


    try{

      const response =
        await changePassword(
          apiSession,
          payload
        );


      setMessage(
        "Password changed successfully."
      );


      return response;


    }
    catch(err:any){

      setError(
        err.message ||
        "Could not change password."
      );

      throw err;

    }
    finally{

      setBusy(false);

    }

  }


  return {
    submitPassword,
    busy,
    message,
    error,
    setError,
    setMessage,
  };

}
