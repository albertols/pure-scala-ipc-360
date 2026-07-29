package io.pure360.etl360;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(Etl360Properties.class)
public class Etl360Application {
    public static void main(String[] args) {
        SpringApplication.run(Etl360Application.class, args);
    }
}
