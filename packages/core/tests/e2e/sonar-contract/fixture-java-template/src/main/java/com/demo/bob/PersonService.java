package com.demo.bob;

public class PersonService {

    public void deletePerson(long id) {
        Person person = new Person(id, "demo");
        doDelete(id);
    }

    public void deletePerson2(long id) {
        Person person = new Person(id, "demo");
        doDelete(id);
    }

    private void doDelete(long id) {
        if (id < 0) {
            throw new IllegalArgumentException("id must be positive");
        }
    }
}

