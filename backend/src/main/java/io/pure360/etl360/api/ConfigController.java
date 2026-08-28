package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.AppConfigDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ConfigController {
    private final Etl360Properties props;
    private final DataRoots dataRoots;

    public ConfigController(Etl360Properties props, DataRoots dataRoots) {
        this.props = props;
        this.dataRoots = dataRoots;
    }

    @GetMapping("/config")
    public AppConfigDto config() {
        Etl360Properties.Gcp gcp = props.gcp();
        return new AppConfigDto(
            gcp.projectId(),
            gcp.region(),
            gcp.dataprocJobUrl(),
            gcp.dataprocClusterUrl(),
            gcp.loggingUrl(),
            gcp.loggingDuration(),
            gcp.bigQueryUrl(),
            dataRoots.dwhControlMode(),
            dataRoots.composerMode(),
            dataRoots.corpus().toString());
    }
}
