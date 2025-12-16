package com.demo.bob;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PersonServiceTest {

    @Test
    void deletePersonRejectsNegativeId() {
        PersonService service = new PersonService();
        assertThrows(IllegalArgumentException.class, () -> service.deletePerson(-1));
    }

    @Test
    void deletePersonAcceptsPositiveId() {
        PersonService service = new PersonService();
        assertDoesNotThrow(() -> service.deletePerson(1));
    }
}

