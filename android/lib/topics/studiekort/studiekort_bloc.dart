import 'package:lectio_wrapper/types/studiekort/kort.dart';
import 'package:lectio_wrapper/utils/dio_image_provider.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/utils/state_pattern.dart';

class StudiekortBloc extends StudentCubit<(Kort?, DioImage?)> {
  StudiekortBloc({required super.student}) {
    load();
  }

  @override
  load() async {
    var card = await student.kort.get();
    emit(StatePattern((card, null), States.okay));
  }

  Future<void> qr() async {
    emit(state..status = States.loading);
    var newQrCode = await student.kort.qr();
    emit(StatePattern((state.state?.$1, newQrCode), States.okay));
  }
}
