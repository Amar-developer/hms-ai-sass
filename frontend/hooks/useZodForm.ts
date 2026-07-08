import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export function useZodForm(schema:any,defaultValues:any){
    return useForm({
        resolver:zodResolver(schema),
        defaultValues:defaultValues,
        mode:'onChange'
    })
}
