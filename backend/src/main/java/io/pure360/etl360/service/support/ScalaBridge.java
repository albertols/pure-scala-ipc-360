package io.pure360.etl360.service.support;

import scala.collection.JavaConverters;
import java.util.List;

public final class ScalaBridge {
    private ScalaBridge() {}
    public static <T> List<T> list(scala.collection.Seq<T> seq) {
        return JavaConverters.seqAsJavaListConverter(seq).asJava();
    }
}
