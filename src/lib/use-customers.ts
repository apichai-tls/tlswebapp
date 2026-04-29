import { useState, useEffect } from "react";
import { type Customer, customerStore } from "./store";

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>(customerStore.getSnapshot());

  useEffect(() => {
    return customerStore.subscribe(() => {
      setCustomers(customerStore.getSnapshot());
    });
  }, []);

  return customers;
}
