import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';

class AbsenceRegistrationsCubit extends StudentCubit<List<AbsenceCauseEntry>> {
  AbsenceRegistrationsCubit({required super.student});

  Future<List<AbsenceCauseEntry>> _getCauses() async {
    var items = await student.absence.registrations.list();
    return items;
  }

  void update(AbsenceCauseEntry absenceCause) async {
    emit(state.loading());
    await student.absence.registrations.update(absenceCause,
        absenceCause.cause ?? AbsenceCauses.late, absenceCause.expandedCause);
    await load();
  }

  @override
  Future<void> load() async {
    var items = await _getCauses();
    emit(state.finish(items));
  }

  @override
  Future<void> refresh() async {
    await load();
  }
}
